/**
 * Asset Planner handler
 *
 * Receives a finalized copywriter output + brand context + the brand's uploaded
 * asset library. For every visual slot in the post it:
 *   1. Decides whether a visual asset is needed for that slot.
 *   2. Describes what the image should communicate.
 *   3. Picks the preferred source: uploaded_asset | unsplash | ai_generated | none
 *   4. When source is uploaded_asset, scores existing assets by tag overlap with
 *      the required visual — returns ranked candidates. This scoring layer is
 *      intentionally simple (tag intersection) so it can be swapped for
 *      vector/embedding search later without changing the output shape.
 *
 * Output shape is consumed downstream by the Canvas Designer module.
 * Nothing here generates canvas JSON or layout.
 */

import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import Groq from 'groq-sdk'

// ─── types (exported for Canvas Designer to import) ──────────────────────────

export interface AssetCandidate {
  asset_id:   string
  url:        string
  thumbnail_url: string
  filename:   string
  tags:       string[]
  score:      number          // 0–1 tag-overlap score; replace with cosine similarity when embeddings land
}

export interface VisualSlot {
  slot_id:          string   // e.g. "slide_1", "single_main"
  slot_label:       string   // human label e.g. "Cover slide" / "Main visual"
  needs_visual:     boolean
  visual_purpose:   string   // what the image should communicate
  search_keywords:  string[] // keywords used to find assets / for Unsplash search
  preferred_source: 'uploaded_asset' | 'unsplash' | 'ai_generated' | 'none'
  source_reason:    string   // why this source was chosen
  candidates:       AssetCandidate[]  // uploaded assets ranked by relevance (may be empty)
  selected:         AssetCandidate | null  // top candidate, or null
}

export interface AssetPlan {
  post_id:     string   // mirrors the idea id
  format:      string   // "single" | "carousel"
  slots:       VisualSlot[]
}

// ─── Groq helpers (same pattern as other handlers) ────────────────────────────

async function getGroqModel(groq: Groq): Promise<string> {
  try {
    const models = await groq.models.list()
    const preferred = ['groq/compound-mini', 'openai/gpt-oss-120b', 'mixtral-8x7b-32768']
    const found = preferred.find(p => models.data.some((m: any) => m.id === p))
    if (found) return found
    const deny = ['guard', 'embed', 'whisper', 'tts', 'orpheus', 'allam', 'safeguard', 'prompt-guard']
    const fallback = models.data.find((m: any) => !deny.some(d => m.id.toLowerCase().includes(d)))
    if (fallback) return fallback.id
  } catch { /* ignore */ }
  return 'groq/compound-mini'
}

// ─── AI: determine visual slots from copy ────────────────────────────────────

const SYSTEM_PROMPT = `You are a visual asset planner for Instagram posts.

You receive the complete written content of an Instagram post (produced by a copywriter) and brand information.
Your job is to analyse each slide or section and decide what visual assets are needed.

For each visual slot return:

"slot_id"         — unique id: "slide_1", "slide_2", … or "single_main"
"slot_label"      — short human label: "Cover slide", "Slide 2", "Main visual", etc.
"needs_visual"    — true if this slot benefits from a real image (not just text/graphic)
"visual_purpose"  — one sentence describing what this image should communicate to the audience
"search_keywords" — 4-8 lowercase keywords describing the ideal image, used to search stock or match uploaded assets
"preferred_source"— one of: "uploaded_asset", "unsplash", "ai_generated", "none"
"source_reason"   — one sentence explaining why this source is preferred

Rules for preferred_source:
- "uploaded_asset": the slot needs a real brand/company image (team photos, product shots, office, events)
- "unsplash": generic stock photography works (cityscapes, abstract concepts, lifestyle)
- "ai_generated": the visual concept is too specific or abstract for stock/uploads
- "none": the slide is best served by typography or graphic design only (no photo needed)

Return ONLY valid JSON. No markdown, no explanation.`

function buildPlannerPrompt(copyJson: string, brandJson: string): string {
  return `Analyse this Instagram post content and produce the visual asset plan.

BRAND:
${brandJson}

POST CONTENT:
${copyJson}

Return exactly this structure:
{
  "slots": [
    {
      "slot_id": "slide_1",
      "slot_label": "Cover slide",
      "needs_visual": true,
      "visual_purpose": "...",
      "search_keywords": ["keyword1", "keyword2"],
      "preferred_source": "uploaded_asset",
      "source_reason": "..."
    }
  ]
}

For a single post return one slot with slot_id "single_main".
For a carousel return one slot per slide.
Return ONLY the JSON.`
}

// ─── Asset matching (tag overlap) ────────────────────────────────────────────
// Straightforward tag intersection score.
// When embedding vectors are stored on assets, replace this with cosine
// similarity between slot.search_keywords vector and asset.embedding.

function scoreAsset(asset: any, keywords: string[]): number {
  if (!Array.isArray(asset.tags) || asset.tags.length === 0) return 0
  const kw = new Set(keywords.map(k => k.toLowerCase()))
  const assetTags = asset.tags.map((t: string) => t.toLowerCase())
  let hits = 0
  for (const tag of assetTags) {
    for (const k of kw) {
      // partial match — "football" matches keyword "sport" via tag "sport" etc.
      if (tag.includes(k) || k.includes(tag)) { hits++; break }
    }
  }
  return hits / Math.max(kw.size, 1)
}

function findCandidates(assets: any[], keywords: string[], topK = 3): AssetCandidate[] {
  return assets
    .filter(a => a.status === 'ready')
    .map(a => ({ asset: a, score: scoreAsset(a, keywords) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map(({ asset, score }) => ({
      asset_id:      asset.id,
      url:           asset.url,
      thumbnail_url: asset.thumbnail_url,
      filename:      asset.filename,
      tags:          asset.tags ?? [],
      score:         parseFloat(score.toFixed(3)),
    }))
}

// ─── handler ─────────────────────────────────────────────────────────────────

export async function handlePlanAssets(db: any, body: any) {
  try {
    const { brandContext, copy, idea, brand_id } = body

    if (!copy)   return corsify(NextResponse.json({ error: 'copy is required' },   { status: 400 }))
    if (!idea)   return corsify(NextResponse.json({ error: 'idea is required' },   { status: 400 }))

    const apiKey = process.env.GROQ_API_KEY
    if (!apiKey) return corsify(NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 }))

    const groq  = new Groq({ apiKey })
    const model = await getGroqModel(groq)

    const copyJson  = JSON.stringify(copy,  null, 2)
    const brandJson = JSON.stringify(brandContext ?? {}, null, 2)

    // Call AI to determine visual slots
    let raw: string | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: buildPlannerPrompt(copyJson, brandJson) },
          ],
          max_tokens: 2000,
          temperature: 0.3,
        })
        raw = res.choices[0]?.message?.content?.trim() ?? null
        break
      } catch (err: any) {
        const is429 = err?.status === 429 || err?.message?.includes('rate_limit')
        if (is429 && attempt < 2) {
          await new Promise(r => setTimeout(r, 15000))
          continue
        }
        throw err
      }
    }

    if (!raw) return corsify(NextResponse.json({ error: 'Empty response from AI' }, { status: 500 }))

    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    let parsed: any
    try {
      parsed = JSON.parse(cleaned)
    } catch {
      return corsify(NextResponse.json({ error: 'AI returned invalid JSON', raw: cleaned }, { status: 500 }))
    }

    const aiSlots: any[] = parsed.slots ?? []

    // Load uploaded assets for this brand (for matching)
    let uploadedAssets: any[] = []
    if (brand_id) {
      uploadedAssets = await db.collection('assets')
        .find({ brand_id, status: 'ready' })
        .limit(500)
        .toArray()
    }

    // Enrich each slot with ranked candidates from the asset library
    const slots: VisualSlot[] = aiSlots.map((s: any) => {
      const keywords: string[] = Array.isArray(s.search_keywords) ? s.search_keywords : []
      const candidates = s.needs_visual && s.preferred_source === 'uploaded_asset'
        ? findCandidates(uploadedAssets, keywords)
        : []

      return {
        slot_id:          s.slot_id        ?? 'slot',
        slot_label:       s.slot_label     ?? s.slot_id,
        needs_visual:     s.needs_visual   ?? false,
        visual_purpose:   s.visual_purpose ?? '',
        search_keywords:  keywords,
        preferred_source: s.preferred_source ?? 'none',
        source_reason:    s.source_reason   ?? '',
        candidates,
        selected:         candidates[0] ?? null,
      }
    })

    const plan: AssetPlan = {
      post_id: idea.id,
      format:  copy.format ?? idea.format,
      slots,
    }

    return corsify(NextResponse.json(plan))
  } catch (error: any) {
    console.error('Asset planner error:', error)
    return corsify(NextResponse.json({ error: error.message || 'Asset planning failed' }, { status: 500 }))
  }
}
