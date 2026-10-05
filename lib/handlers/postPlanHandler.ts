import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import { loadGenerationBrandContext } from '@/lib/services/generationBrandContext'
import { chooseBrandFamily } from '@/lib/designs/global/generation'
import { studyForPlanning, familyGrammar, familyImagery } from '@/lib/designs/global/study'
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
  closing: 'conclusion with a prominent call to action',
}

/** Planning instructions appended to the copy request. Only the saved study is sent, never reference images or coordinates. */
export function designPlanningPrompt(family: GlobalDesignFamily) {
  const study = studyForPlanning(family)
  return `DESIGN PLAN (required in the same JSON). This post follows the saved design study below: a visual language, not a template. Brand colors, fonts, logo, sizes and coordinates are applied automatically later; never choose them.
DESIGN STUDY: ${JSON.stringify(study)}
COMPOSITIONS this study allows: ${study.compositions.map(c => `"${c}" = ${COMPOSITION_GUIDE[c]}`).join('; ')}.
Add "design" to every carousel slide (for a single post, add a top-level "design"):
"design": {"composition": "<one of ${study.compositions.join(', ')}>", "emphasis": ["one or two exact words from the headline to highlight"], "image": null or {"subject": "one concrete, realistic visible subject or scene that explains this slide", "queries": ["2-4 word English stock search", "alternative wording, same subject"]}}
Rules: choose the composition that serves each slide's content, and vary compositions across a carousel while respecting the recurring rules; never give every slide the same composition unless the study demands it. Follow the imagery strategy and its frequency: "image" must be null when imagery mode is "none" or the composition is statement, backdrop-type, list or closing; image-led and split always need an image. Image subjects follow the strategy (cutout = one isolated subject; background = a scene that leaves quiet space for text; contained = a subject that reads well inside a frame). Never put words, logos or brand marks in image subjects. Avoid the anti-patterns.`
}

const TEXT_ONLY = new Set(['statement', 'backdrop-type', 'list', 'closing'])

/** Deterministically keeps only plan values that the study supports. Invalid choices fall back to rule-based composition. */
export function sanitizeDesignPlan(family: GlobalDesignFamily, copy: any) {
  const allowed = new Set(familyGrammar(family).compositions as string[])
  const imageryOn = familyImagery(family).mode !== 'none'
  const clean = (slide: any) => {
    const raw = slide?.design && typeof slide.design === 'object' ? slide.design : {}
    const composition = allowed.has(raw.composition) ? raw.composition : undefined
    const headline = String(slide?.headline || '').toLowerCase().split(/\s+/)
    const emphasis = (Array.isArray(raw.emphasis) ? raw.emphasis : []).map((w: any) => String(w).trim()).filter((w: string) => w && headline.includes(w.toLowerCase())).slice(0, 2)
    const wantsImage = imageryOn && !TEXT_ONLY.has(composition)
    const image = wantsImage && raw.image && typeof raw.image.subject === 'string' && raw.image.subject.trim()
      ? { subject: raw.image.subject.trim().slice(0, 500), queries: (Array.isArray(raw.image.queries) ? raw.image.queries : []).filter((q: any) => typeof q === 'string' && q.trim()).map((q: string) => q.trim().slice(0, 80)).slice(0, 3) }
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
    let copy = body.copy
    if (!copy) {
      if (selection) {
        const allowed = new Set(familyGrammar(selection.family).compositions as string[])
        const design = { prompt: designPlanningPrompt(selection.family), validate: (parsed: any) => {
          const slides = parsed.format === 'carousel' ? parsed.slides : [parsed]
          if (!slides.some((s: any) => allowed.has(s?.design?.composition))) throw Error('Missing "design" plan with a valid composition')
        } }
        copy = sanitizeDesignPlan(selection.family, (await writeCopy(brandContext, idea, design)).copy)
      } else copy = (await writeCopy(brandContext, idea)).copy
    } else if (selection) copy = sanitizeDesignPlan(selection.family, copy)
    const plan = await planAssets(db, { brandContext, copy, idea, brand_id: `brand_${brandContext.id}`, designId: selection?.design.id || body.designId })
    return corsify(NextResponse.json({ copy, plan, needsVisuals: plan.slots.some((s: any) => s.needs_visual), imageMode: plan.layoutPlan?.imageMode || null }))
  } catch (error: any) {
    return copyErrorResponse(error, 'Post planning failed')
  }
}
