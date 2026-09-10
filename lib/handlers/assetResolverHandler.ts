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

import { prepareSubjectAssets } from '@/lib/services/subjectAssets'
import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import type { AssetPlan, VisualSlot } from './assetPlannerHandler'

// ─── Output types (consumed by Canvas Designer) ───────────────────────────────

export type AssetSource = 'uploaded_asset' | 'unsplash' | 'ai_generated' | 'none'

export interface ResolvedAsset {
  subject?: { url: string; width: number; height: number }
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
  treatment?: 'isolated_subject' | 'environmental'
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
  campaign_index?: number
  post_id: string
  format:  string
  slots:   ResolvedSlot[]
}

// ─── Unsplash ─────────────────────────────────────────────────────────────────

const UNSPLASH_API = 'https://api.unsplash.com'

async function searchUnsplash(
  slot: VisualSlot,
  accessKey: string,
  usedPhotoIds: Set<string>,
): Promise<ResolvedAsset | null> {
  const clean = (values: unknown): string[] => Array.isArray(values)
    ? values.filter((v): v is string => typeof v === 'string' && !!v.trim()).map(v => v.trim()) : []
  const explicit = clean(slot.search_queries)
  const queries = [...new Set(explicit.length ? explicit : [clean(slot.search_keywords).slice(0, 5).join(' ')])].filter(Boolean).slice(0, 3)
  for (const query of queries) {
    const url   = `${UNSPLASH_API}/search/photos?query=${encodeURIComponent(query)}&per_page=20`

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

    const candidates = (Array.isArray(data?.results) ? data.results : [])
      .filter((photo: any) => photo.id && (photo.urls?.regular || photo.urls?.full) && !usedPhotoIds.has(photo.id))
      .slice(0, 20)
    if (!candidates.length) continue
    // Rank subject relevance; reserve before another slot resumes.
    const terms = clean(slot.search_keywords).join(' ').toLowerCase().split(/\W+/).filter(t => t.length > 2)
    const score = (photo: any) => {
      const description = [photo.alt_description, photo.description, ...(photo.tags ?? []).map((t: any) => t.title)].join(' ').toLowerCase()
      return terms.filter(term => description.includes(term)).length + (slot.treatment === 'isolated_subject'
        ? (/portrait|isolated|single|studio|close.up/.test(description) ? 3 : 0) - (/crowd|group of|aerial|skyline|landscape/.test(description) ? 6 : 0) : 0)
    }
    const photo = candidates.sort((a: any, b: any) => score(b) - score(a))[0]
    usedPhotoIds.add(photo.id)

    return {
      source:        'unsplash',
      url:           photo.urls?.regular ?? photo.urls?.full ?? '',
      thumbnail_url: photo.urls?.thumb   ?? photo.urls?.small ?? '',
      width:         photo.width         ?? 1080,
      height:        photo.height        ?? 1080,
      asset_id:      null,
      unsplash_id:   photo.id            ?? null,
      alt:           photo.alt_description ?? photo.description ?? slot.visual_purpose,
    }
  }
  return null
}

// ─── AI image generation ──────────────────────────────────────────────────────
// Primary:  fal.ai fast-sdxl  (requires FAL_KEY with credit)
// Fallback: Pollinations.AI   (free, no key required)

async function generateImageFal(
  prompt: string,
  apiKey: string,
): Promise<ResolvedAsset | null> {
  try {
    const submitRes = await fetch('https://queue.fal.run/fal-ai/fast-sdxl', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size:          'square_hd',
        num_inference_steps: 28,
        num_images:          1,
      }),
    })

    if (!submitRes.ok) {
      const e = await submitRes.text()
      console.error('[resolver] fal.ai submit error:', e)
      return null
    }

    const { request_id, status_url, response_url } = await submitRes.json()
    if (!request_id && !status_url) return null

    const poll      = response_url ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}`
    const statusUrl = status_url   ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}/status`
    const deadline  = Date.now() + 90_000

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } })
      if (!statusRes.ok) break
      const st = await statusRes.json()
      if (st.status === 'COMPLETED' || st.status === 'completed') break
      if (st.status === 'FAILED'    || st.status === 'failed')    return null
    }

    const resultRes = await fetch(poll, { headers: { Authorization: `Key ${apiKey}` } })
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

async function generateImagePollinations(prompt: string): Promise<ResolvedAsset | null> {
  const key = process.env.POLLINATIONS_API_KEY
  if (!key) throw new Error('Pollinations: POLLINATIONS_API_KEY is not configured')
  return requestGeneratedImage('Pollinations', 'https://gen.pollinations.ai/image/'+encodeURIComponent(prompt)+'?model=flux&width=1024&height=1024&seed='+Math.floor(Math.random()*2147483647), {method:'GET',headers:{Authorization:'Bearer '+key}},prompt)
}

async function requestGeneratedImage(provider: string, url: string, options: any, prompt: string): Promise<ResolvedAsset> {
  const res = await fetch(url,{...options,signal:AbortSignal.timeout(90000)})
  if (!res.ok) { await res.body?.cancel(); throw new Error(provider+': HTTP '+res.status+(res.status===401||res.status===403?' (check token/model access)':res.status===429?' (rate limit)':res.status===402?' (credits exhausted)':'')) }
  if (!res.headers.get('content-type')?.startsWith('image/')) {await res.body?.cancel();throw new Error(provider+': response was not an image')}
  const reader=res.body!.getReader(), chunks:Uint8Array[]=[]
  let size=0
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6*1024*1024)throw new Error(provider+': image exceeds size limit');chunks.push(value)}}finally{await reader.cancel()}
  const bytes=Buffer.concat(chunks)
  const src='data:'+res.headers.get('content-type')!.split(';')[0]+';base64,'+bytes.toString('base64')
  return {source:'ai_generated',url:src,thumbnail_url:src,width:1024,height:1024,asset_id:null,unsplash_id:null,alt:prompt}
}

async function generateImageHuggingFace(prompt: string): Promise<ResolvedAsset | null> {
  if (!process.env.HF_TOKEN) throw new Error('Hugging Face: HF_TOKEN is not configured')
  const model=process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-3-medium-diffusers'
  return requestGeneratedImage('Hugging Face','https://router.huggingface.co/hf-inference/models/'+model,{method:'POST',headers:{Authorization:'Bearer '+process.env.HF_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({inputs:prompt})},prompt)
}

async function generateImage(
  visualPurpose: string,
  keywords: string[],
  falKey: string | null,
): Promise<ResolvedAsset | null> {
  const prompt = [visualPurpose, ...keywords.slice(0, 4),
    'Follow the requested visual medium exactly: photorealistic only for photographic briefs, a clean conceptual render for illustration briefs. Strong readable silhouette, deliberate studio lighting, clear separation of subject and background, realistic geometry, no warped devices or malformed hands. No watermark or signature. Professional campaign photography or polished conceptual product render as described. One clear focal subject, complete silhouette, no clipped head or hands, no text, no watermark, no invented logos. If an isolated subject is requested, use a plain contrasting studio background, never a checkerboard pattern; background removal is performed separately.',
  ].join(', ')

  const failures: string[] = []
  const providers: {name:string;run:()=>Promise<ResolvedAsset|null>}[] = []
  if (process.env.POLLINATIONS_API_KEY) providers.push({name:'Pollinations',run:()=>generateImagePollinations(prompt)})
  if (process.env.HF_TOKEN) providers.push({name:'Hugging Face',run:()=>generateImageHuggingFace(prompt)})
  if (falKey) providers.push({name:'fal.ai',run:()=>generateImageFal(prompt,falKey)})
  if (!providers.length) throw new Error('No image provider configured. Set POLLINATIONS_API_KEY, HF_TOKEN or FAL_KEY.')
  for (const provider of providers) {
    console.info('[resolver] Generating image with '+provider.name)
    try {
      const image=await provider.run()
      if(image){console.info('[resolver] '+provider.name+' image ready');return image}
      failures.push(provider.name+': generation failed (see provider error above)')
    } catch(error) {
      const reason=(error as Error).name==='TimeoutError'?provider.name+': timed out':(error as Error).message
      failures.push(reason)
      console.warn('[resolver] '+reason)
    }
  }
  throw new Error(failures.join('; '))
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
  usedPhotoIds: Set<string>,
): Promise<ResolvedSlot> {
  const base: Omit<ResolvedSlot, 'resolvedAsset' | 'warning'> = {
    treatment:     slot.treatment,
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
      if (asset) return { ...base, resolvedAsset: asset, warning }

      // No uploaded asset found — cascade to Unsplash, then AI generation
      console.warn(`[resolver] ${slot.slot_id}: no uploaded asset, trying Unsplash`)
      if (unsplashKey) {
        const unsplashAsset = await searchUnsplash(slot, unsplashKey, usedPhotoIds)
        if (unsplashAsset) {
          return {
            ...base,
            source:        'unsplash',
            resolvedAsset: { ...unsplashAsset, source: 'unsplash' },
            warning:       'No uploaded asset found — used Unsplash instead',
          }
        }
      }

      console.warn(`[resolver] ${slot.slot_id}: Unsplash also failed, trying AI generation`)
      const aiAsset = await generateImage([slot.generation_prompt || slot.visual_purpose, slot.subject_description, slot.treatment === 'isolated_subject' ? 'One complete isolated subject on a plain contrasting background, no scenery, no panels, no collage' : ''].filter(Boolean).join('. '), slot.search_keywords ?? [], falKey)
      return {
        ...base,
        source:        aiAsset ? 'ai_generated' : slot.preferred_source,
        resolvedAsset: aiAsset ? { ...aiAsset, source: 'ai_generated' } : null,
        warning:       aiAsset
          ? 'No uploaded asset found — used AI generation instead'
          : (warning ?? 'No asset found from any source'),
      }
    }

    case 'unsplash': {
      if (!unsplashKey) {
        return { ...base, resolvedAsset: null, warning: 'UNSPLASH_ACCESS_KEY not configured' }
      }
      const asset = await searchUnsplash(slot, unsplashKey, usedPhotoIds)
      return {
        ...base,
        resolvedAsset: asset,
        warning: asset ? null : 'Unsplash returned no results for these keywords',
      }
    }

    case 'ai_generated': {
      const asset = await generateImage([slot.generation_prompt || slot.visual_purpose, slot.subject_description, slot.treatment === 'isolated_subject' ? 'One complete isolated subject on a plain contrasting background, no scenery, no panels, no collage' : ''].filter(Boolean).join('. '), slot.search_keywords ?? [], falKey)
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

    // Shared synchronous reservations prevent duplicate photos across concurrent slots.
    const usedPhotoIds = new Set<string>()
    if (brand_id) {
      try { const recent=await db.collection('assetImageHistory').find({brand_id}).sort({createdAt:-1}).limit(80).toArray();recent.forEach((item:any)=>usedPhotoIds.add(item.photoId)) } catch(error) {console.warn('[resolver] Image history unavailable')}
    }
    const slots: ResolvedSlot[] = await Promise.all(
      plan.slots.map(slot =>
        resolveSlot(db, slot, brand_id ?? null, unsplashKey, falKey, usedPhotoIds).catch(error=>({slot_id:slot.slot_id,slot_label:slot.slot_label,needs_visual:slot.needs_visual,visual_purpose:slot.visual_purpose,source:slot.preferred_source,resolvedAsset:null,warning:(error as Error).message}))
      )
    )

    if (brand_id) {
      const history=slots.filter(s=>s.resolvedAsset?.unsplash_id).map(s=>({brand_id,photoId:s.resolvedAsset!.unsplash_id,createdAt:new Date()}))
      if(history.length)try{await db.collection('assetImageHistory').insertMany(history)}catch(error){console.warn('[resolver] Could not save image history')}
    }
    const result: ResolvedAssetPlan = {
      post_id: plan.post_id,
      format:  plan.format,
      slots,
    }

    return corsify(NextResponse.json(await prepareSubjectAssets(db, result)))
  } catch (error: any) {
    console.error('[resolver] error:', error)
    return corsify(
      NextResponse.json({ error: error.message || 'Asset resolution failed' }, { status: 500 })
    )
  }
}
