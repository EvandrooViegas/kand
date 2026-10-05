import { DesignLibraryError, hydrateBrandFamilies } from './store'
import { familyImagery, familyGrammar } from './study'
import { planSlides, composeSlide, imageFrame } from './compose'
import { validatePost } from './validate'
import type { GlobalDesignFamily } from './types'

/** `content` can be the idea (before copy exists) or the copy; selection is stable for the same text. */
export async function chooseBrandFamily(db: any, brand: any, content: any, designId?: string) {
  // Explicit legacy selections keep older posts and saved designs editable.
  if (designId && !designId.startsWith('global-')) return null
  const families = await hydrateBrandFamilies(db, brand)
  // Brands that have not opted into the Global Design Library continue to use their saved legacy/starter designs.
  // One selected study is enough: it composes varied layouts by itself.
  if (!families.length) return null
  if (designId) {
    const requested = families.find(f => f.design.id === designId)
    if (!requested) throw new DesignLibraryError('This design is not in the brand’s library.', 404)
    return requested
  }
  // Imagery belongs to the design study, so brand image preferences play no part here.
  const text = JSON.stringify(content).toLowerCase()
  const ranked = families.map(f => ({ ...f, score: f.family.tags.reduce((n, tag) => n + (text.includes(tag.toLowerCase()) ? 2 : 0), 0) }))
  ranked.sort((a, b) => b.score - a.score)
  // Stable selection based on content; the same copy always picks the same family.
  const top = ranked.filter(f => f.score === ranked[0].score)
  const hash = [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0)
  return top[hash % top.length]
}

const slidesOf = (copy: any) => Array.isArray(copy.slides) && copy.slides.length ? copy.slides : [copy]

/** Deterministic: the study grammar decides each slide's composition and whether it carries imagery. No model call. */
export function globalLayoutPlan(family: GlobalDesignFamily, designId: string, copy: any) {
  const slides = slidesOf(copy)
  const imagery = familyImagery(family), grammar = familyGrammar(family)
  const plans = planSlides(family, copy)
  const behaviour = [imagery.usage, imagery.cropBehavior, imagery.subjectPlacement, imagery.textRelationship].filter(Boolean).join(' ')
  const slots = slides.map((slide: any, index: number) => {
    const plan = plans[index], frame = imageFrame(family, plan)
    const mode = imagery.mode === 'cutout' ? 'cutout' : frame ? (frame.width * frame.height >= family.width * family.height * .8 ? 'background' : 'contained') : 'none'
    return {
      slot_id: slides.length > 1 ? `slide_${index + 1}` : 'single_main', composition: plan.composition, plan, imageMode: mode,
      needs_visual: !!frame, background: mode === 'background', frame,
      treatment: mode === 'cutout' ? 'isolated_subject' : 'environmental',
      planned: frame ? slide.design?.image || null : null,
      brief: frame ? `${mode === 'cutout' ? 'Isolated subject for' : 'Photograph for'} a ${family.width}×${family.height} composition, filling a ${frame.width}×${frame.height} area (${Math.round(frame.width / frame.height * 100) / 100}:1). Imagery ${grammar.imagery.dominance === 'dominates' ? 'dominates the composition' : grammar.imagery.dominance === 'supports' ? 'supports the typography' : 'shares the composition with typography'}. ${behaviour} Keep the areas behind text quiet; do not put typography in the image.`.slice(0, 1400) : '',
      spec: { composition: plan.composition, background: { type: mode === 'background' ? 'image' : 'solid', color: 'bg' }, elements: frame ? [{ type: 'image', ...frame }] : [] },
    }
  })
  return { version: 4, source: 'global', familyId: family.id, familyVersion: family.version, designId, width: family.width, height: family.height, format: slides.length > 1 || copy.format === 'carousel' ? 'carousel' : 'single', imageMode: imagery.mode, imageDisposition: slots.some((s: any) => s.needs_visual) ? 'background' : 'none', slots }
}

/** Compose → validate. Copy that cannot fit its composition is tried in a calmer composition of the same study before failing. */
export function renderGlobalPost(family: GlobalDesignFamily, brand: any, copy: any, resolvedPlan: any, design: any, id: () => string, name?: string) {
  const layout = globalLayoutPlan(family, design.id, copy)
  const slides = slidesOf(copy)
  const pages = slides.map((slide: any, index: number) => {
    const slot = layout.slots[index]
    const resolved = resolvedPlan.slots?.find((s: any) => s.slot_id === slot.slot_id) || resolvedPlan.slots?.[index]
    const asset = resolved?.resolvedAsset
    const image = slot.needs_visual ? (slot.imageMode === 'cutout' && asset?.subject?.url) || asset?.url || '' : ''
    const content = { ...slide, cta: slide.cta || (index === slides.length - 1 ? copy.cta : '') }
    // Fallbacks keep the slide's imagery decision, so the study's image behaviour is never swapped.
    const attempts = [slot.plan, { ...slot.plan, composition: slot.plan.withImage ? 'image-led' : 'statement', anchor: 'center' }]
    let lastError: any
    for (const plan of attempts) {
      try {
        const page = composeSlide(family, brand, content, plan, index, slides.length, { image })
        return { ...page, nodes: page.nodes.map(n => ({ ...n, id: id() })), id: id(), name: `${index + 1}. ${page.composition}`, order: index, type: index === 0 ? 'top_peer' : index === slides.length - 1 ? 'bottom_peer' : 'content', globalComposition: page.composition }
      } catch (error: any) { if (error.status !== 422) throw error; lastError = error }
    }
    throw Object.assign(new Error(`${slides.length > 1 ? `Slide ${index + 1}: ` : ''}${lastError.message}`), { status: 422 })
  })
  const now = new Date()
  const canvas: any = {
    id: id(), flowId: brand.id, name: name || `${brand.name || 'Post'} — ${slides[0]?.headline || ''}`.slice(0, 120),
    type: layout.format, width: family.width, height: family.height, background: pages[0].background,
    nodes: layout.format === 'single' ? pages[0].nodes : [], groups: [], classes: pages[0].classes,
    ...(layout.format === 'carousel' ? { pages } : {}),
    designSelection: { id: design.id, name: family.name, tags: family.tags, source: 'global', globalFamilyId: family.id, globalVersion: family.version },
    designInput: { brandContext: brand, copy, resolvedPlan: { ...resolvedPlan, designId: design.id, layoutPlan: layout } },
    createdAt: now, updatedAt: now,
  }
  const validation = validatePost(canvas)
  if (!validation.passed) throw Object.assign(new Error(validation.errors.join('; ')), { status: 422 })
  canvas.validation = validation
  return canvas
}
