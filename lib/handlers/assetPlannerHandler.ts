import { localAssetBrief } from '@/lib/designs/localAssetBrief'
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
import { planPostLayout } from '@/lib/designs/postLayout'

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
  image_style?: 'photograph' | 'drawing'
  treatment?: 'isolated_subject' | 'environmental'
  subject_description?: string
  generation_prompt?: string
  slide_context?: {headline:string;body:string;purpose:string;post_topic:string}
  brand_context?: {name:string;industry:string;audience:string;colors:string[]}
  search_queries?:  string[] // ordered standalone stock searches, not tags
  visual_purpose:   string   // what the image should communicate
  search_keywords:  string[] // keywords used to find assets / for Unsplash search
  preferred_source: 'uploaded_asset' | 'unsplash' | 'ai_generated' | 'none'
  source_reason:    string   // why this source was chosen
  candidates:       AssetCandidate[]  // uploaded assets ranked by relevance (may be empty)
  selected:         AssetCandidate | null  // top candidate, or null
}

export interface AssetPlan {
  layoutPlan?: any
  designId?: string
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

Follow planned frames. Background frames prefer Unsplash stock photography with broad searches; preserve the environment. AI may be used for specific backgrounds without transparency. Foreground subjects prefer ai_generated. Use uploaded_asset when a real brand asset is needed. For foreground subjects Unsplash is a resolver fallback after AI failure; still provide broad search_queries for that fallback. Use none for intentional text-only slides.

Rules for preferred_source:
- "uploaded_asset": the slot needs a real brand/company image (team photos, product shots, office, events)
- "unsplash": generic stock photography works (cityscapes, abstract concepts, lifestyle)
- "ai_generated": the visual concept is too specific or abstract for stock/uploads
- "none": the slide is best served by typography or graphic design only (no photo needed)

Editorial decisions, before searching:
- Evaluate each slide's headline and body independently. Use photography when seeing a concrete subject, action, setting, or example helps explain that specific message.
- Consider an explanatory object before choosing text-only: storage costs can use stacked cartons; a catalogue can use an isolated tablet with generic product tiles; checkout can use a card terminal. Prefer a simple realistic photograph of a relevant object or activity. Never invent factual product UI or charts. Reserve text-only for messages without a useful visual interpretation.
- A cover does not automatically need a photo. Choose one only when a visible subject provides a meaningful hook.
- Review the whole sequence for pacing, but do not impose an image quota or alternate mechanically. Respect explicit image requests in the brief.
- Describe the visible subject and its connection to THIS slide in visual_purpose. For text-only slots, explain why text/graphics communicate it better.

Also return treatment (isolated_subject or environmental), subject_description (ONE dominant visible person, object or coherent object assembly), and generation_prompt (English brief with subject, material, pose, lighting and realistic commercial photography style). Default to isolated_subject for foreground people, products and conceptual illustrations: a real transparent silhouette, never a rounded rectangular photo. Request complete subjects on simple backgrounds. Use environmental only when the setting explains the message.

Visual quality and relevance:
- Build a concrete visual metaphor for the slide, not generic business filler. Checkout: a single payment terminal or hand holding a card. Inventory costs: cartons on a shelf. Automation: a coherent device/object assembly. Do not use unrelated smiling portraits for these concepts.
- A cover can use a compelling subject even though it has only a headline. Its image must support that hook, with a complete visible silhouette and a useful pose.
- Stock works for real, recognizable subjects. Use ai_generated for a specific realistic subject or activity. Do not search stock with abstract marketing slogans.
- generation_prompt must specify exactly what is visible, what it communicates, focal subject, viewpoint, material and lighting. Include no lettering, no fake brand marks, no watermarks, no UI screenshots, no collages or duplicated objects unless explicitly needed.
- Match the actual number of copy slides exactly. Never invent extra slots or default to five.

 For people-focused campaigns, compose an expressive waist-up person with a believable emotion matching the message and a complete relevant prop. Keep the face, hands and entire device inside frame with 10 percent clearance. For logistics show a person handling a parcel, not an unrelated laptop. Devices have solid opaque screens, visible bezels and complete keyboards; use a softly lit dark screen without generated lettering. Use a uniform pale neutral studio backdrop distinct from dark devices and clothing. Never make screens transparent or match their colour to the backdrop. Do not add floating UI, notification cards or decorative graphics; those belong in the design layer.
Realism is mandatory unless the brief explicitly asks for illustration. Show an observable action matching the slide: working means a person typing at a laptop; cooking means a chef preparing food with utensils; delivery means a courier handling a package. Do not substitute generic portraits, abstract sculptures, icons or diagrams for real activities. Include the tools/props that make the action understandable. For cutouts, keep hands, the laptop or cooking tools together as one foreground assembly; avoid clipping them. For kitchen/office scenes whose environment matters, set treatment=environmental.

For ai_generated, generation_prompt must be a detailed 60–120 word English brief: exact subject and number of objects, action, viewpoint, composition, material, lighting, background and exclusions. Translate technical benefits into a simple realistic scene; never ask the model to render words such as SSR, SSG or SEO. Stock search_queries must remain short and broad even when this generation brief is very specific.

Campaign art direction:
- Plan imagery as a coordinated campaign: different poses, actions or product angles that share photographic style, lighting and brand-relevant color cues.
- We can remove backgrounds from both stock and generated images automatically. When a person/product is the visual hook, describe a clear standalone subject with unclipped head, hands and product, a simple background, and visible silhouette. Avoid crowds, occlusion and wide office scenes for these cutout-led concepts.
- For generated conceptual visuals, describe a realistic physical product or person performing one simple action on a plain contrasting background, with no text or fabricated brand logos. Do not request fake checkerboard transparency; the segmentation stage creates the actual transparent PNG.
- Preserve meaningful environmental scenes when context is important. Do not force every image into a cutout or invent factual product imagery.

Search strategy:
- Also return "search_queries": 2-3 ordered, standalone English stock searches of 2-4 words each. Use a broad concrete subject plus one action: "payment terminal", "warehouse shelves", "person laptop". Do not include lighting, brand colors, camera angles, isolated-background instructions or technical marketing jargon. Alternatives describe the SAME scene with different wording or fewer constraints, keeping the essential subject. Never concatenate these queries.
- Keep search_keywords as concrete subject/action/setting tags for uploaded-asset matching. Avoid vague themes like success, innovation, business, lifestyle, or growth without a visible subject.
- Give different image slots distinct scenes grounded in their own copy, not the same keywords rearranged. A soil-checking slide might search ["hands testing garden soil", "gardener holding soil"]; a watering slide ["watering vegetable plant roots", "garden drip irrigation"]. Neither should search "nature growth green".
- Avoid marketing slogans, camera jargon, and long image-generation prompts in stock queries. Generic stock is appropriate only when it accurately illustrates the message, not as evidence of a named brand product, team, or event.
- When needs_visual is false, preferred_source must be none and both search arrays must be empty. When preferred_source is none, needs_visual must be false.

Return ONLY valid JSON. No markdown, no explanation.`

function buildPlannerPrompt(copyJson: string, brandJson: string, ideaJson: string): string {
  return `Analyse this Instagram post content and produce the visual asset plan.

BRAND:
${brandJson}

POST CONTENT:
${copyJson}

POST BRIEF:
${ideaJson}

Return exactly this structure:
{
  "slots": [
    {
      "slot_id": "slide_1",
      "slot_label": "Cover slide",
      "needs_visual": true,
      "visual_purpose": "...",
      "search_keywords": ["keyword1", "keyword2"],
      "search_queries": ["concrete subject action", "subject alternative setting wording"],
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
    let { brandContext, copy, idea, brand_id } = body
    if(!copy||!idea)return corsify(NextResponse.json({error:'copy and idea are required'},{status:400}))
    if (brandContext?.id || brand_id) {
      const flow=await db.collection('flows').findOne({id:brandContext?.id || brand_id})
      if(flow?.brandContext)brandContext=flow.brandContext
    }
    const designs=Array.isArray(brandContext?.designs)?brandContext.designs:[]
    const layoutPlan=body.layoutPlan||planPostLayout(brandContext,copy,idea,body.designId)
    if(body.phase==='canvas')return corsify(NextResponse.json(layoutPlan))
    const selectedDesign=designs.find((d:any)=>d.id===layoutPlan.designId)
    const imagery=selectedDesign?.blueprint?.imagery

    if (!copy)   return corsify(NextResponse.json({ error: 'copy is required' },   { status: 400 }))
    if (!idea)   return corsify(NextResponse.json({ error: 'idea is required' },   { status: 400 }))

    const aiSlots=layoutPlan.slots.map((layout:any,index:number)=>localAssetBrief(layout,copy.slides?.[index]||copy,idea))

    // Load uploaded assets for this brand (for matching)
    let uploadedAssets: any[] = []
    if (brand_id) {
      uploadedAssets = await db.collection('assets')
        .find({ brand_id, status: 'ready' })
        .limit(500)
        .toArray()
    }

    // Enrich each slot with ranked candidates from the asset library
    const slots: VisualSlot[] = layoutPlan.slots.map((layout:any,index:number) => {
      const s=aiSlots.find((s:any)=>s.slot_id===layout.slot_id)||aiSlots[index]||{}
      const position = /^slide_\d+$/.test(s.slot_id) ? Number(s.slot_id.split('_')[1])-1 : index
      const slide = copy.slides?.[position] ?? copy
      const bounded = (v: any, limit=1500) => typeof v === 'string' ? v.slice(0,limit) : ''
      const needsVisual = layout.needs_visual
      const cleanTerms = (value: any): string[] => Array.isArray(value)
        ? Array.from(new Set<string>(value.filter((v: any) => typeof v === 'string').map((v: string) => v.trim().toLowerCase()).filter(Boolean))) : []
      const keywords = needsVisual ? cleanTerms(s.search_keywords).slice(0, 8) : []
      const candidates = s.needs_visual && s.preferred_source === 'uploaded_asset'
        ? findCandidates(uploadedAssets, keywords)
        : []

      return {
        slot_id:          layout.slot_id,
        slot_label:       s.slot_label     ?? s.slot_id,
        needs_visual:     imagery?.placement==='none'?false:needsVisual,
        image_style: imagery?.style || 'photograph',
        treatment: layout.treatment,
        subject_description: typeof s.subject_description === 'string' ? s.subject_description.slice(0, 500) : '',
        slide_context: {headline:bounded(slide.headline),body:bounded(slide.body || slide.supportingText),purpose:bounded(slide.purpose,200),post_topic:bounded(idea.topic || idea.title)},
        brand_context: {name:bounded(brandContext?.name,200),industry:bounded(brandContext?.industry,300),audience:bounded(brandContext?.targetAudience || brandContext?.audience,500),colors:Array.isArray(brandContext?.colors)?brandContext.colors.filter((c:any)=>typeof c==='string').slice(0,8):[]},
        generation_prompt: (typeof s.generation_prompt === 'string' ? s.generation_prompt.slice(0, 2000) : '') + '\n'+layout.brief + (imagery ? '\nRequired design art direction: '+JSON.stringify(imagery) : ''),
        visual_purpose:   s.visual_purpose ?? '',
        search_keywords:  keywords,
        search_queries:   needsVisual ? cleanTerms(s.search_queries).slice(0, 3) : [],
        preferred_source: needsVisual ? (layout.background?'unsplash':s.preferred_source==='uploaded_asset'?'uploaded_asset':'ai_generated') : 'none',
        source_reason:    s.source_reason   ?? '',
        candidates,
        selected:         candidates[0] ?? null,
      }
    })

    const plan: AssetPlan = {
      designId:layoutPlan.designId,
      layoutPlan,
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
