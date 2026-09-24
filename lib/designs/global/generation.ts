import { chooseVariant, resolveVariant } from './resolve'
import { DesignLibraryError, hydrateBrandFamilies } from './store'
import type { GlobalDesignFamily } from './types'

export async function chooseBrandFamily(db: any, brand: any, copy: any, designId?: string) {
  const saved = Array.isArray(brand?.designs) ? brand.designs : []
  // Explicit legacy selections keep older posts and saved designs editable.
  if (designId && !designId.startsWith('global-')) return null
  const families = await hydrateBrandFamilies(db, brand)
  // Brands that have not opted into the Global Design Library continue to use
  // their saved legacy/starter designs. A partial Global selection is invalid.
  if (!families.length) return null
  if (families.length < 3) {
    throw new DesignLibraryError('Choose at least 3 Global Designs in Brand Personalization → Post design before generating a post.', 409)
  }
  if (designId) {
    const requested = families.find(f => f.design.id === designId)
    if (!requested) throw new DesignLibraryError('This design is not in the brand’s library.', 404)
    return requested
  }
  const text = JSON.stringify(copy).toLowerCase()
  const ranked = families.map(f => ({ ...f, score: f.family.tags.reduce((n, tag) => n + (text.includes(tag.toLowerCase()) ? 2 : 0), 0) + (brand.imageDisposition === 'background' && f.family.variants.some(v => v.nodes.some(n => n.src === '{{image.primary}}')) ? 4 : 0) }))
  ranked.sort((a, b) => b.score - a.score)
  // Stable selection based on content; there is no random layout or coordinate generation.
  const top = ranked.filter(f => f.score === ranked[0].score)
  const hash = [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 0)
  return top[hash % top.length]
}

export function globalLayoutPlan(family: GlobalDesignFamily, designId: string, copy: any) {
  const slides = Array.isArray(copy.slides) && copy.slides.length ? copy.slides : [copy]
  const slots = slides.map((slide: any, index: number) => {
    const variant = chooseVariant(family, slide, index, slides.length)
    const photo = variant.nodes.find(n => n.src === '{{image.primary}}')
    const background = !!photo && photo.width === family.width && photo.height === family.height
    const frame = photo ? { x: photo.x, y: photo.y, width: photo.width, height: photo.height } : null
    return {
      slot_id: slides.length > 1 ? `slide_${index + 1}` : 'single_main', variantId: variant.id,
      needs_visual: !!photo, background, frame, treatment: 'environmental',
      brief: photo ? `Photograph for a fixed ${family.width}×${family.height} composition. Preserve the whole scene. The photograph fills x=${photo.x}, y=${photo.y}, width=${photo.width}, height=${photo.height}. Keep the areas behind the template's text quiet; do not put typography in the image.` : '',
      spec: { composition: variant.name, background: { type: background ? 'image' : 'solid', color: 'bg' }, elements: variant.nodes.filter(n => n.type === 'text' || n.src === '{{image.primary}}').map(n => ({ ...n, role: n.type === 'text' ? n.text?.match(/\{\{([^}]+)\}\}/)?.[1] : undefined })) },
    }
  })
  return { version: 2, source: 'global', familyId: family.id, familyVersion: family.version, designId, width: family.width, height: family.height, format: slides.length > 1 || copy.format === 'carousel' ? 'carousel' : 'single', imageDisposition: slots.some(s => s.needs_visual) ? 'background' : 'none', slots }
}

export function renderGlobalPost(family: GlobalDesignFamily, brand: any, copy: any, resolvedPlan: any, design: any, id: () => string, name?: string) {
  const layout = globalLayoutPlan(family, design.id, copy)
  const slides = Array.isArray(copy.slides) && copy.slides.length ? copy.slides : [copy]
  const pages = slides.map((slide: any, index: number) => {
    const slot = layout.slots[index], variant = family.variants.find(v => v.id === slot.variantId)!
    const resolved = resolvedPlan.slots?.find((s: any) => s.slot_id === slot.slot_id) || resolvedPlan.slots?.[index]
    const canvas = resolveVariant(family, variant, brand, { ...slide, cta: slide.cta || (index === slides.length - 1 ? copy.cta : '') }, index, resolved?.resolvedAsset?.url || '')
    return { ...canvas, nodes: canvas.nodes.map(n => ({ ...n, id: id() })), id: id(), name: variant.name, order: index, type: index === 0 ? 'top_peer' : index === slides.length - 1 ? 'bottom_peer' : 'content', globalVariantId: variant.id }
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
