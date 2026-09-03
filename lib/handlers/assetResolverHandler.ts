/**
 * Asset Resolver
 *
 * Takes the output of the Asset Planner (AssetPlan) and resolves every visual
 * slot into a concrete, usable asset.  The Canvas Designer consumes the output
 * without knowing which source produced each asset.
 *
 * Resolution strategy per slot:
 *
 *   uploaded_asset → look up the planned candidate by asset_id in MongoDB.
 *                    If the planner found no candidate, fall back to a
 *                    fresh tag-overlap search against the brand library.
 *
 *   unsplash       → search the Unsplash API using search_keywords and
 *                    return the most relevant result.
 *
 *   ai_generated   → call the image-generation API (fal.ai fast-sdxl).
 *                    Falls back gracefully when the key is absent.
 *
 *   none           → resolvedAsset: null (typography-only slot)
 */

import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import type { AssetPlan, VisualSlot } from './assetPlannerHandler'

// ─── Output types (consumed by Canvas Designer) ───────────────────────────────

export type AssetSource = 'uploaded_asset' | 'unsplash' | 'ai_generated' | 'none'

export interface ResolvedAsset {
  source:        AssetSource
  url:           string
  thumbnail_url: string
  width:         number
  height:        number
  /** Populated for uploaded assets */
  asset_id:      string | null
  /** Populated for Unsplash assets */
  unsplash_id:   string | null
  /** Alt text / description for accessibility and Canvas Designer */
  alt:           string
}

export interface ResolvedSlot {
  slot_id:       string
  slot_label:    string
  needs_visual:  boolean
  visual_purpose: string
  resolvedAsset: ResolvedAsset | null
  /** Mirrors the planner source so the Canvas Designer can make informed layout decisions */
  source:        AssetSource
  /** Non-fatal warning when resolution had to fall back or partially failed */
  warning:       string | null
}

export interface ResolvedAssetPlan {
  post_id: string
  format:  string
  slots:   ResolvedSlot[]
}

// ─── Unsplash ─────────────────────────────────────────────────────────────────

const UNSPLASH_API = 'https://api.unsplash.com'

async function searchUnsplash(
  keywords: string[],
  accessKey: string,
): Promise<ResolvedAsset | null> {
  const query = keywords.slice(0, 5).join(' ')
  const url   = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&per_page=5&orientation=squarish`

  let data: any
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) {
      console.error(`[resolver] Unsplash ${res.status} for query "${query}"`)
      return null
    }
    data = await res.json()
  } catch (err: any) {
    console.error('[resolver] Unsplash fetch error:', err?.message)
    return null
  }

  const photo = data?.results?.[0]
  if (!photo) return null

  return {
    source:        'unsplash',
    url:           photo.urls?.regular ?? photo.urls?.full ?? '',
    thumbnail_url: photo.urls?.thumb   ?? photo.urls?.small ?? '',
    width:         photo.width         ?? 1080,
    height:        photo.height        ?? 1080,
    asset_id:      null,
    unsplash_id:   photo.id            ?? null,
    alt:           photo.alt_description ?? photo.description ?? keywords.join(', '),
  }
}

// ─── AI image generation (fal.ai fast-sdxl) ──────────────────────────────────

async function generateImage(
  visualPurpose: string,
  keywords: string[],
  apiKey: string,
): Promise<ResolvedAsset | null> {
  const prompt = [visualPurpose, ...keywords.slice(0, 4)].join(', ')

  try {
    // fal.ai queue-based inference: submit → poll → result
    const submitRes = await fetch('https://queue.fal.run/fal-ai/fast-sdxl', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size:        'square_hd',
        num_inference_steps: 28,
        num_images:        1,
      }),
    })

    if (!submitRes.ok) {
      const e = await submitRes.text()
      console.error('[resolver] fal.ai submit error:', e)
      return null
    }

    const { request_id, status_url, response_url } = await submitRes.json()
    if (!request_id && !status_url) return null

    // Poll until done (max 90s, 3s interval)
    const poll = response_url ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}`
    const statusUrl = status_url ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}/status`
    const deadline  = Date.now() + 90_000

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch(statusUrl, {
        headers: { Authorization: `Key ${apiKey}` },
      })
      if (!statusRes.ok) break
      const st = await statusRes.json()
      if (st.status === 'COMPLETED' || st.status === 'completed') break
      if (st.status === 'FAILED'    || st.status === 'failed')    return null
    }

    const resultRes = await fetch(poll, {
      headers: { Authorization: `Key ${apiKey}` },
    })
    if (!resultRes.ok) return null
    const result = await resultRes.json()

    const img = result?.images?.[0]
    if (!img?.url) return null

    return {
      source:        'ai_generated',
      url:           img.url,
      thumbnail_url: img.url,
      width:         img.width  ?? 1024,
      height:        img.height ?? 1024,
      asset_id:      null,
      unsplash_id:   null,
      alt:           prompt,
    }
  } catch (err: any) {
    console.error('[resolver] fal.ai generation error:', err?.message)
    return null
  }
}

// ─── Uploaded-asset lookup ────────────────────────────────────────────────────

async function resolveUploadedAsset(
  db: any,
  slot: VisualSlot,
  brand_id: string | null,
): Promise<{ asset: ResolvedAsset | null; warning: string | null }> {
  // Primary: use the asset the planner already selected
  if (slot.selected?.asset_id) {
    const doc = await db.collection('assets').findOne({ id: slot.selected.asset_id })
    if (doc && doc.status === 'ready') {
      return {
        asset: {
          source:        'uploaded_asset',
          url:           doc.url,
          thumbnail_url: doc.thumbnail_url,
          width:         doc.width  ?? 0,
          height:        doc.height ?? 0,
          asset_id:      doc.id,
          unsplash_id:   null,
          alt:           doc.filename,
        },
        warning: null,
      }
    }
  }

  // Fallback: fresh tag-overlap search if the planner had no candidate
  if (brand_id) {
    const assets = await db.collection('assets')
      .find({ brand_id, status: 'ready' })
      .limit(500)
      .toArray()

    const kw  = slot.search_keywords ?? []
    const kwSet = new Set(kw.map((k: string) => k.toLowerCase()))

    let best: any = null
    let bestScore = 0
    for (const a of assets) {
      if (!Array.isArray(a.tags)) continue
      let hits = 0
      for (const tag of a.tags.map((t: string) => t.toLowerCase())) {
        for (const k of kwSet) {
          if (tag.includes(k) || k.includes(tag)) { hits++; break }
        }
      }
      const score = hits / Math.max(kwSet.size, 1)
      if (score > bestScore) { bestScore = score; best = a }
    }

    if (best && bestScore > 0) {
      return {
        asset: {
          source:        'uploaded_asset',
          url:           best.url,
          thumbnail_url: best.thumbnail_url,
          width:         best.width  ?? 0,
          height:        best.height ?? 0,
          asset_id:      best.id,
          unsplash_id:   null,
          alt:           best.filename,
        },
        warning: slot.selected?.asset_id
          ? 'Planned asset unavailable; using closest tag match from library'
          : null,
      }
    }
  }

  return {
    asset:   null,
    warning: 'No matching uploaded asset found',
  }
}

// ─── Main resolver ────────────────────────────────────────────────────────────

async function resolveSlot(
  db: any,
  slot: VisualSlot,
  brand_id: string | null,
  unsplashKey: string | null,
  falKey: string | null,
): Promise<ResolvedSlot> {
  const base: Omit<ResolvedSlot, 'resolvedAsset' | 'warning'> = {
    slot_id:       slot.slot_id,
    slot_label:    slot.slot_label,
    needs_visual:  slot.needs_visual,
    visual_purpose: slot.visual_purpose,
    source:        slot.preferred_source,
  }

  if (!slot.needs_visual || slot.preferred_source === 'none') {
    return { ...base, resolvedAsset: null, warning: null }
  }

  switch (slot.preferred_source) {
    case 'uploaded_asset': {
      const { asset, warning } = await resolveUploadedAsset(db, slot, brand_id)
      return { ...base, resolvedAsset: asset, warning }
    }

    case 'unsplash': {
      if (!unsplashKey) {
        return { ...base, resolvedAsset: null, warning: 'UNSPLASH_ACCESS_KEY not configured' }
      }
      const asset = await searchUnsplash(slot.search_keywords ?? [], unsplashKey)
      return {
        ...base,
        resolvedAsset: asset,
        warning: asset ? null : 'Unsplash returned no results for these keywords',
      }
    }

    case 'ai_generated': {
      if (!falKey) {
        return { ...base, resolvedAsset: null, warning: 'FAL_KEY not configured — skipping AI generation' }
      }
      const asset = await generateImage(slot.visual_purpose, slot.search_keywords ?? [], falKey)
      return {
        ...base,
        resolvedAsset: asset,
        warning: asset ? null : 'AI image generation failed',
      }
    }

    default:
      return { ...base, resolvedAsset: null, warning: null }
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

export async function handleResolveAssets(db: any, body: any) {
  try {
    const { plan, brand_id }: { plan: AssetPlan; brand_id?: string } = body

    if (!plan || !Array.isArray(plan.slots)) {
      return corsify(
        NextResponse.json({ error: 'plan with slots array is required' }, { status: 400 })
      )
    }

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY ?? null
    const falKey      = process.env.FAL_KEY             ?? null

    // Resolve all slots concurrently — each resolution is independent
    const slots: ResolvedSlot[] = await Promise.all(
      plan.slots.map(slot =>
        resolveSlot(db, slot, brand_id ?? null, unsplashKey, falKey)
      )
    )

    const result: ResolvedAssetPlan = {
      post_id: plan.post_id,
      format:  plan.format,
      slots,
    }

    return corsify(NextResponse.json(result))
  } catch (error: any) {
    console.error('[resolver] error:', error)
    return corsify(
      NextResponse.json({ error: error.message || 'Asset resolution failed' }, { status: 500 })
    )
  }
}
