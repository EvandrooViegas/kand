import { resolveVariant } from './resolve'
import { DesignLibraryError, hydrateBrandFamilies } from './store'
import { ensureFamilyVariations } from './variations'
import type { GlobalDesignFamily } from './types'

export async function chooseBrandFamily(db: any, brand: any, copy: any, designId?: string) {
  // Explicit legacy selections keep older posts and saved designs editable.
  if (designId && !designId.startsWith('global-')) return null
  const families = await hydrateBrandFamilies(db, brand)
  // Brands without a Global Design retain their starter-design path.
  if (!families.length) return null
  if (designId) {
    const requested = families.find(f => f.design.id === designId)
    if (!requested) throw new DesignLibraryError('This design is not in the brand’s library.', 404)
    return requested
  }
  const text = JSON.stringify(copy).toLowerCase()
  const usage = new Map<string, number>()
  if (brand?.id) {
    try {
      const history = await db.collection('canvases').find({ flowId: brand.id, 'designSelection.source': 'global' }, { projection: { 'designSelection.globalFamilyId': 1 } }).toArray()
      for (const canvas of history) {
        const familyId = canvas.designSelection?.globalFamilyId
        if (familyId) usage.set(familyId, (usage.get(familyId) || 0) + 1)
      }
    } catch { /* New databases may not have a canvases collection yet. */ }
  }
  const ranked = families.map(f => ({ ...f,
    usage: usage.get(f.family.id) || 0,
    score: f.family.tags.reduce((n, tag) => n + (text.includes(tag.toLowerCase()) ? 2 : 0), 0),
  }))
  const leastUsed = Math.min(...ranked.map(f => f.usage))
  const balanced = ranked.filter(f => f.usage === leastUsed)
  const bestScore = Math.max(...balanced.map(f => f.score))
  const top = balanced.filter(f => f.score === bestScore)
  const hash = [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0)
  return top[hash % top.length]
}

export function globalLayoutPlan(family: GlobalDesignFamily, designId: string, copy: any, imagery?: string) {
  family = ensureFamilyVariations(family)
  const selectedImagery = imagery === 'framed' ? 'background' : imagery || 'cutout'
  const available = family.identityVersion === 1 ? family.variants.filter(v => v.imagery === selectedImagery) : family.variants
  if (!available.length) throw new DesignLibraryError(`This family has no ${selectedImagery} variations.`, 422)
  const slides = Array.isArray(copy.slides) && copy.slides.length ? copy.slides : [copy]
  const seed = [...JSON.stringify(copy)].reduce((value, character) => (Math.imul(value, 31) + character.charCodeAt(0)) >>> 0, 0)
  const slots = slides.map((slide: any, index: number) => {
    const covers = available.filter(variant => variant.role === 'cover')
    const contents = available.filter(variant => variant.role !== 'cover')
    const needsBody = Boolean(slide.body || slide.bullets?.length)
    const needsCta = Boolean(slide.cta || (index === slides.length - 1 && copy.cta))
    const compatible = contents.filter(variant =>
      (!needsBody || variant.nodes.some(node => node.text?.includes('{{body}}'))) &&
      (!needsCta || variant.nodes.some(node => node.text?.includes('{{cta}}'))))
    const candidates = index === 0 ? covers : (compatible.length ? compatible : contents)
    const variant = candidates[(seed + Math.max(0, index - 1)) % candidates.length]
    const compositionId = 'structural'
    const photo = variant.nodes.find(n => n.src === '{{image.primary}}')
    const cutout = !!photo && (photo.imageType === 'cutout' || family.designType === 'cutout')
    const background = !!photo && !cutout && photo.width === family.width && photo.height === family.height
    const frame = photo ? { x: photo.x, y: photo.y, width: photo.width, height: photo.height } : null
    return {
      slot_id: slides.length > 1 ? `slide_${index + 1}` : 'single_main', variantId: variant.id, compositionId,
      needs_visual: !!photo, background, frame, treatment: cutout ? 'cutout' : 'environmental',
      brief: photo ? `${photo.imageBrief || (cutout ? 'Isolated foreground subject with its essential props.' : 'Photograph preserving the whole scene.')} For a fixed ${family.width}×${family.height} composition, the image fills x=${photo.x}, y=${photo.y}, width=${photo.width}, height=${photo.height}. ${cutout ? 'Use a transparent background and preserve the complete foreground assembly and gesture.' : 'Keep the areas behind the template text quiet.'} Do not put typography in the image.` : '',
      spec: { composition: variant.name, background: { type: background ? 'image' : 'solid', color: 'bg' }, elements: variant.nodes.filter(n => n.type === 'text' || n.src === '{{image.primary}}').map(n => ({ ...n, role: n.type === 'text' ? n.text?.match(/\{\{([^}]+)\}\}/)?.[1] : undefined })) },
    }
  })
  return { version: 2, source: 'global', familyId: family.id, familyVersion: family.version, designId, width: family.width, height: family.height, format: slides.length > 1 || copy.format === 'carousel' ? 'carousel' : 'single', imageDisposition: slots.some(s => s.treatment === 'cutout') ? 'cutout' : slots.some(s => s.needs_visual) ? 'background' : 'none', slots }
}

export function renderGlobalPost(family: GlobalDesignFamily, brand: any, copy: any, resolvedPlan: any, design: any, id: () => string, name?: string) {
  family = ensureFamilyVariations(family)
  const layout = globalLayoutPlan(family, design.id, copy, resolvedPlan.layoutPlan?.imageDisposition || resolvedPlan.imageDisposition || brand.imageDisposition)
  const slides = Array.isArray(copy.slides) && copy.slides.length ? copy.slides : [copy]
  const pages = slides.map((slide: any, index: number) => {
    const slot = layout.slots[index], variant = family.variants.find(v => v.id === slot.variantId)!
    const resolved = resolvedPlan.slots?.find((s: any) => s.slot_id === slot.slot_id) || resolvedPlan.slots?.[index]
    const canvas = resolveVariant(family, variant, brand, { ...slide, cta: slide.cta || (index === slides.length - 1 ? copy.cta : '') }, index, resolved?.resolvedAsset?.url || '')
    return { ...canvas, nodes: canvas.nodes.map(n => ({ ...n, id: id() })), id: id(), name: variant.name, order: index, type: index === 0 ? 'top_peer' : index === slides.length - 1 ? 'bottom_peer' : 'content', globalVariantId: variant.id, globalCompositionId: slot.compositionId || 'structural' }
  })
  const now = new Date()
  return {
    id: id(), flowId: brand.id, name: name || `${brand.name || 'Post'} — ${slides[0]?.headline || ''}`.slice(0, 120),
    type: layout.format, width: family.width, height: family.height, background: pages[0].background,
    nodes: layout.format === 'single' ? pages[0].nodes : [], groups: [], classes: pages[0].classes,
    ...(layout.format === 'carousel' ? { pages } : {}),
    designSelection: { id: design.id, name: family.name, tags: family.tags, source: 'global', globalFamilyId: family.id, globalVersion: family.version },
    designInput: { brandContext: brand, copy, resolvedPlan: { ...resolvedPlan, designId: design.id, layoutPlan: layout } },
    createdAt: now, updatedAt: now,
  }
}
