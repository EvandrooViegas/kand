import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import { loadGenerationBrandContext } from '@/lib/services/generationBrandContext'
import { chooseBrandFamily } from '@/lib/designs/global/generation'
import { studyForPlanning, familyGrammar, familyImagery, familyCutouts } from '@/lib/designs/global/study'
import type { GlobalDesignFamily } from '@/lib/designs/global/types'
import { writeCopy, copyErrorResponse } from './copywritingHandler'
import { planAssets } from './assetPlannerHandler'

const COMPOSITION_GUIDE: Record<string, string> = {
  statement: 'one dominant headline with brief supporting copy, typography-led',
  stacked: 'headline and supporting copy stacked; with imagery the photo takes the opposite band (top or bottom)',
  split: 'copy in one column, photograph in the other',
  'image-led': 'photograph dominates; compact copy over or beside it',
  'backdrop-type': 'oversized low-opacity word behind smaller foreground copy',
  list: 'headline plus 2-6 short enumerated items (write the items as numbered body lines)',
  closing: 'conclusion slide: the takeaway, with the call to action when the slide has one',
}

/** A transparent PNG already in the brand gallery that the plan may reuse; `ref` is the short id shown to the model. */
export interface GalleryCutout { ref: string; id: string; description: string }

const CUTOUT_SUBJECT = 'ONE isolated subject with no background (a person, hands, a product or an object doing or showing something concrete for this slide), complete silhouette, no scene, no backdrop, no text'

/** Planning instructions appended to the copy request. Only the saved study is sent, never reference images or coordinates. */
export function designPlanningPrompt(family: GlobalDesignFamily, gallery: GalleryCutout[] = []) {
  const study = studyForPlanning(family)
  const cutouts = familyCutouts(family)
  const image = cutouts === 'always'
    ? `{"subject": "${CUTOUT_SUBJECT}"${gallery.length ? ', "reuse": "gallery ref or omit"' : ''}}`
    : cutouts === 'some'
      ? `{"kind": "cutout" or "photo", "subject": "cutout: ${CUTOUT_SUBJECT}; photo: one concrete, realistic visible subject or scene", "queries": ["2-4 word English stock search (photo only)", "alternative wording, same subject"]${gallery.length ? ', "reuse": "gallery ref or omit (cutout only)"' : ''}}`
      : `{"subject": "one concrete, realistic visible subject or scene that explains this slide", "queries": ["2-4 word English stock search", "alternative wording, same subject"]}`
  const imageRule = cutouts === 'always'
    ? 'Every image in this study is a transparent cutout (a PNG with no background standing on the design surface), never a photograph with a background.'
    : cutouts === 'some'
      ? 'This study mixes transparent cutouts and photographs: set "kind" per slide as the study describes.'
      : 'Image subjects follow the strategy (background = a scene that leaves quiet space for text; contained = a subject that reads well inside a frame).'
  const galleryBlock = gallery.length ? `
BRAND GALLERY CUTOUTS (transparent PNGs already made for this brand): ${gallery.map(g => `${g.ref} = "${g.description}"`).join('; ')}.
When one of them clearly fits a slide's message, set "reuse" to its ref (and repeat its description as "subject") instead of inventing a new subject; use each at most once per post. When none fits, omit "reuse" and describe a new subject.` : ''
  return `DESIGN PLAN (required in the same JSON). This post follows the saved design study below: a visual language, not a template. Brand colors, fonts, logo, sizes and coordinates are applied automatically later; never choose them.
DESIGN STUDY: ${JSON.stringify(study)}
COMPOSITIONS this study allows: ${study.compositions.map(c => `"${c}" = ${COMPOSITION_GUIDE[c]}`).join('; ')}.
Add "design" to every carousel slide (for a single post, add a top-level "design"):
"design": {"composition": "<one of ${study.compositions.join(', ')}>", "emphasis": ["one or two exact words from the headline to highlight"], "image": null or ${image}}
Rules: choose the composition that serves each slide's content, and vary compositions across a carousel while respecting the recurring rules; never give every slide the same composition unless the study demands it. Follow the imagery strategy and its frequency: "image" must be null when imagery mode is "none" or the composition is statement, backdrop-type, list or closing; image-led and split always need an image. ${imageRule} Image subjects are written in English. Never put words, logos or brand marks in image subjects. Avoid the anti-patterns.${galleryBlock}`
}

/** A short subject label for a saved cutout. Descriptions that are generation instructions, not subjects, give ''. */
export function cutoutLabel(description: any): string {
  const text = String(description || '').replace(/\s+/g, ' ').trim()
  if (!text || /^(choose|create|generate|carrossel|carousel)\b/i.test(text)) return ''
  return text.replace(/^object-only:\s*/i, '').split(/,\s*(?:no|without)\s/i)[0].replace(/"/g, "'").slice(0, 110).trim()
}

/** The brand's reusable transparent cutouts, most recently used first, one per subject. Never fails planning. */
export async function galleryCutouts(db: any, flowId: string | undefined): Promise<GalleryCutout[]> {
  if (!flowId || !db) return []
  try {
    const assets = await db.collection('assets').find({ brand_id: `brand_${flowId}`, source: 'ai_generated', status: 'ready', treatment: 'isolated_subject' }, { projection: { _id: 0, id: 1, description: 1, subject_description: 1 } })
      .sort({ last_used_at: -1, created_at: -1 }).limit(40).toArray()
    const seen = new Set<string>(), listed: { id: string; description: string }[] = []
    for (const asset of assets) {
      const description = cutoutLabel(asset.subject_description || asset.description)
      if (!asset.id || !description || seen.has(description.toLowerCase())) continue
      seen.add(description.toLowerCase()); listed.push({ id: asset.id, description })
    }
    return listed.slice(0, 24).map((a, i) => ({ ref: `g${i + 1}`, ...a }))
  } catch { return [] }
}

const TEXT_ONLY = new Set(['statement', 'backdrop-type', 'list', 'closing'])

/** Deterministically keeps only plan values that the study supports. Invalid choices fall back to rule-based composition. */
export function sanitizeDesignPlan(family: GlobalDesignFamily, copy: any, gallery: GalleryCutout[] = []) {
  const allowed = new Set(familyGrammar(family).compositions as string[])
  const imageryOn = familyImagery(family).mode !== 'none'
  const cutouts = familyCutouts(family)
  const reused = new Set<string>()
  const clean = (slide: any) => {
    const raw = slide?.design && typeof slide.design === 'object' ? slide.design : {}
    const composition = allowed.has(raw.composition) ? raw.composition : undefined
    const headline = String(slide?.headline || '').toLowerCase().split(/\s+/)
    const emphasis = (Array.isArray(raw.emphasis) ? raw.emphasis : []).map((w: any) => String(w).trim()).filter((w: string) => w && headline.includes(w.toLowerCase())).slice(0, 2)
    const wantsImage = imageryOn && !TEXT_ONLY.has(composition)
    const kind = cutouts === 'always' ? 'cutout' : cutouts === 'some' && raw.image?.kind === 'cutout' ? 'cutout' : cutouts === 'some' ? 'photo' : undefined
    // A reuse names a listed gallery cutout (short ref, or its id when re-planning saved copy), once per post.
    const pick = kind === 'cutout' && raw.image?.reuse ? gallery.find(g => g.ref === raw.image.reuse || g.id === raw.image.reuse) : undefined
    const reuse = pick && !reused.has(pick.id) ? pick : undefined
    if (reuse) reused.add(reuse.id)
    const subject = typeof raw.image?.subject === 'string' && raw.image.subject.trim() ? raw.image.subject.trim() : reuse?.description || ''
    const image = wantsImage && raw.image && subject
      ? { subject: subject.slice(0, 500), queries: (Array.isArray(raw.image.queries) ? raw.image.queries : []).filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim().slice(0, 80)).slice(0, 3), ...(kind ? { kind } : {}), ...(reuse ? { reuse: reuse.id } : {}) }
      : null
    const { design, ...rest } = slide
    return { ...rest, ...(emphasis.length ? { emphasis } : {}), design: { ...(composition ? { composition } : {}), image } }
  }
  return Array.isArray(copy.slides) && copy.slides.length ? { ...copy, slides: copy.slides.map(clean) } : clean(copy)
}

/**
 * PLAN: one model call returns copy + composition plan; asset needs are derived in code.
 * Existing copy can be re-planned with zero model calls.
 */
export async function handlePlanPost(db: any, body: any) {
  try {
    const { idea } = body
    if (!idea) return corsify(NextResponse.json({ error: 'idea (content brief) is required' }, { status: 400 }))
    const brandContext = await loadGenerationBrandContext(db, body)
    if (!brandContext) return corsify(NextResponse.json({ error: 'Brand not found' }, { status: 400 }))
    const selection = await chooseBrandFamily(db, brandContext, body.copy || idea, body.designId)
    // Saved transparent cutouts are offered to the plan only when the study uses cutouts.
    const gallery = selection && familyCutouts(selection.family) !== 'never' ? await galleryCutouts(db, brandContext.id) : []
    let copy = body.copy
    if (!copy) {
      if (selection) {
        const allowed = new Set(familyGrammar(selection.family).compositions as string[])
        const design = { prompt: designPlanningPrompt(selection.family, gallery), validate: (parsed: any) => {
          const slides = parsed.format === 'carousel' ? parsed.slides : [parsed]
          if (!slides.some((s: any) => allowed.has(s?.design?.composition))) throw Error('Missing "design" plan with a valid composition')
        } }
        copy = sanitizeDesignPlan(selection.family, (await writeCopy(brandContext, idea, design)).copy, gallery)
      } else copy = (await writeCopy(brandContext, idea)).copy
    } else if (selection) copy = sanitizeDesignPlan(selection.family, copy, gallery)
    const plan = await planAssets(db, { brandContext, copy, idea, brand_id: `brand_${brandContext.id}`, designId: selection?.design.id || body.designId })
    return corsify(NextResponse.json({ copy, plan, needsVisuals: plan.slots.some((s: any) => s.needs_visual), imageMode: plan.layoutPlan?.imageMode || null }))
  } catch (error: any) {
    return copyErrorResponse(error, 'Post planning failed')
  }
}
