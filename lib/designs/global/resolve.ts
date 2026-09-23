import type { GlobalDesignFamily, DesignVariant, TemplateNode } from './types'

const hex = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined
  if (/^#[a-f\d]{6}$/i.test(value)) return value
  if (/^#[a-f\d]{3}$/i.test(value)) return '#' + value.slice(1).split('').map(c => c + c).join('')
}
function lightness(color: string) {
  const c = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
const on = (color: string) => lightness(color) > .179 ? '#101010' : '#ffffff'
const font = (value: any, fallback: string) => (typeof value === 'string' ? value : value?.family || value?.name || fallback).replace(/-?(Regular|SemiBold|Bold|Italic)$/i, '')

export function resolveBrandTokens(brand: any = {}, family?: GlobalDesignFamily): Record<string, string> {
  const colors = (Array.isArray(brand.colors) ? brand.colors : []).map(hex).filter(Boolean) as string[]
  const roles = brand.designTokens || {}
  const primary = hex(roles.primary) || colors[0] || '#3154d5'
  const secondary = hex(roles.secondary) || colors[1] || primary
  const accent = hex(roles.accent) || colors[2] || colors[1] || primary
  const background = hex(roles.background) || colors.find(c => lightness(c) > .8) || '#ffffff'
  const text = hex(roles.textPrimary) || colors.find(c => lightness(c) < .08) || on(background)
  return {
    'brand.primary': primary, 'brand.secondary': secondary, 'brand.accent': accent,
    'brand.background': background, 'brand.textPrimary': text,
    'brand.textSecondary': hex(roles.textSecondary) || text,
    'brand.onPrimary': lightness(primary) <= .3 ? '#ffffff' : '#101010', 'brand.onAccent': on(accent), 'brand.onImage': '#ffffff', 'brand.overlay': '#000000', transparent: '#00000000',
    'brand.headingFont': font(brand.headingFont || brand.fonts?.[0], family?.typography.headingFallback || 'Inter'),
    'brand.bodyFont': font(brand.bodyFont || brand.fonts?.[1] || brand.fonts?.[0], family?.typography.bodyFallback || 'Inter'),
  }
}

export function chooseVariant(family: GlobalDesignFamily, slide: any, index: number, total: number): DesignVariant {
  const preferred = index === 0 ? (total === 1 && String(slide.body || slide.supportingText || '').length > 110 ? 'content' : 'cover')
    : index === total - 1 ? 'cta'
      : /list|steps|checklist|passos|lista/i.test(slide.purpose || '') || Array.isArray(slide.items) || /(?:^|\n)\s*(?:[-•]|\d+[.)])/.test(slide.body || '') ? 'list'
        : /quote|cita/i.test(slide.purpose || '') ? 'quote' : 'content'
  // Only pick a variant inside this one family; unsupported roles reuse its content layout.
  const accepts = (v: DesignVariant) => (!String(slide.body || slide.supportingText || '').trim() || v.nodes.some(n => n.text?.includes('{{body}}'))) && (!String(slide.cta || '').trim() || v.nodes.some(n => n.text?.includes('{{cta}}')))
  return family.variants.find(v => v.role === preferred && accepts(v)) || family.variants.find(v => v.role === 'content' && accepts(v)) || family.variants.find(accepts) || family.variants[0]
}

function fitSize(text: string, node: TemplateNode, resolvedFont: string): number {
  const preferred = node.fontSize || 40, minimum = Math.min(preferred, node.minFontSize || 22)
  const factor = ['Oswald', 'Bebas Neue', 'Anton'].includes(resolvedFont) ? .82 : ['Playfair Display', 'Dancing Script', 'Pacifico', 'Lobster'].includes(resolvedFont) ? 1.12 : 1
  const width = node.width - (node.highlight === 'background' ? 28 : 8)
  for (let size = preferred; size >= minimum; size--) {
    let lines = 0
    for (const paragraph of text.split('\n')) {
      let used = 0
      lines++
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        const length = [...word].reduce((sum, c) => sum + size * (/[ilI.,'!:;]/.test(c) ? .32 : /[MW@#%]|[^\u0000-\u024f]/.test(c) ? 1 : .65) * factor + Math.max(0, node.letterSpacing || 0), 0)
        const gap = used ? size * .34 * factor : 0
        if (used && used + gap + length > width) { lines++; used = 0 }
        if (length > width) { lines += Math.ceil(length / width) - 1; used = length % width || width }
        else used += (used ? gap : 0) + length
      }
    }
    if (lines * size * (node.lineHeight || 1.15) + 8 <= node.height) return size
  }
  throw Object.assign(new Error(`The ${node.id} text is too long for this design. Shorten it or split it into another slide.`), { status: 422 })
}

// Content is text data, never executable inline-style markup supplied by a model.
const clean = (value: any) => String(value ?? '').replace(/<%|%>|\{\{|\}\}/g, '').slice(0, 8000)
export function contentSlots(brand: any, slide: any, index = 0, image = ''): Record<string, string> {
  let website = clean(brand.website || '')
  try { if (website) website = new URL(website).hostname } catch {}
  const steps = Array.isArray(slide.steps) ? slide.steps : Array.isArray(slide.items) ? slide.items : []
  return {
    headline: clean(slide.headline || slide.title), body: clean(slide.body || slide.supportingText || (Array.isArray(slide.items) ? slide.items.join('\n') : '')),
    cta: clean(slide.cta), eyebrow: clean(slide.eyebrow || slide.subheadline), number: String(index + 1).padStart(2, '0'),
    author: clean(slide.author || brand.author || brand.name), 'brand.name': clean(brand.name), 'brand.website': website,
    'brand.logo': typeof brand.logo === 'string' ? brand.logo : '', 'image.primary': image,
    ...Object.fromEntries([1, 2, 3, 4].map(i => [`step.${i}`, clean(steps[i - 1])])),
  }
}

/** Compile template data into the application's existing editable Canvas node format. */
export function resolveVariant(family: GlobalDesignFamily, variant: DesignVariant, brand: any = {}, slide: any = {}, index = 0, image = '', options: { preview?: boolean; placeholders?: boolean } = {}) {
  const tokens = resolveBrandTokens(brand, family), slots = contentSlots(brand, slide, index, image)
  const surface = tokens[variant.background]
  const contrast = (a: string, b: string) => (Math.max(lightness(a), lightness(b)) + .05) / (Math.min(lightness(a), lightness(b)) + .05)
  // The same brand may use a dark primary surface and a light editorial surface.
  if (contrast(tokens['brand.textPrimary'], surface) < 4.5) tokens['brand.textPrimary'] = on(surface)
  if (contrast(tokens['brand.textSecondary'], surface) < 4.5) tokens['brand.textSecondary'] = tokens['brand.textPrimary']
  const classes: Record<string, any> = {
    'family-highlight': { background: tokens['brand.accent'], color: tokens['brand.onAccent'], paddingX: 8, paddingY: 0 },
    'family-emphasis': { color: variant.background === 'brand.primary' ? (tokens['brand.onPrimary'] === tokens['brand.textPrimary'] && contrast(tokens['brand.accent'], surface) >= 3 ? tokens['brand.accent'] : tokens['brand.onPrimary']) : tokens['brand.accent'], fontWeight: 700 },
  }
  const nodes = variant.nodes.flatMap(template => {
    const n: any = { ...template }
    for (const key of ['color', 'fill', 'stroke', 'fontFamily']) if (n[key]) n[key] = tokens[n[key]] || n[key]
    if (n.fillAlpha !== undefined && n.fill === surface) n.fill = tokens['brand.textPrimary']
    if (n.stops) n.stops = n.stops.map((stop: any) => ({ ...stop, color: tokens[stop.color] }))
    if (n.fillAlpha !== undefined && /^#[a-f\d]{6}$/i.test(n.fill)) n.fill += Math.round(n.fillAlpha * 2.55).toString(16).padStart(2, '0')
    if (n.type === 'image') {
      n.src = slots[template.src!.slice(2, -2)]
      if (!n.src) {
        if (options.placeholders) { n.src = ''; return [{ ...n, templateBinding: { src: template.src } }] }
        if (template.optional) return []
        if (!options.preview) throw new Error('This design needs a photograph. Resolve the image before generating the canvas.')
        return [{ id: n.id, type: 'shape', shape: 'rect', x: n.x, y: n.y, width: n.width, height: n.height, fill: tokens['brand.secondary'] }]
      }
    }
    if (n.type === 'text') {
      if (!options.placeholders && template.id === 'brand-name' && slots['brand.logo'] && variant.nodes.some(v => v.src === '{{brand.logo}}')) return []
      n.text = template.text!.replace(/\{\{([^}]+)\}\}/g, (_match, key) => slots[key] || '').trim()
      if (!n.text && !options.placeholders) return []
      if (template.textTransform === 'uppercase') n.text = n.text.toUpperCase()
      if (template.textTransform === 'lowercase') n.text = n.text.toLowerCase()
      try { n.fontSize = fitSize(n.text, template, n.fontFamily) }
      catch (error) { if (!options.preview) throw error; n.fontSize = template.minFontSize || 22 }
      if (template.highlight && template.highlight !== 'none') {
        const words = n.text.split(/\s+/)
        const requested = Array.isArray(slide.emphasis) ? slide.emphasis.map((w: any) => clean(w).toLowerCase()) : []
        const selected = requested.length ? words.filter((w: string) => requested.includes(w.toLowerCase())).slice(0, template.highlightCount || 1)
          : template.highlightCount === 2 ? [words[Math.min(1, words.length - 1)], words[words.length - 1]] : [words[Math.min(words.length - 1, Math.floor(words.length * .55))]]
        n.text = n.text.split(/(\s+)/).map((word: string) => selected.includes(word) ? `<%kind:${template.highlight === 'background' ? 'family-highlight' : 'family-emphasis'}:${word}%>` : word).join('')
      }
      if (options.placeholders) { n.text = template.text; n.fontSize = template.fontSize }
    }
    // Keep role bindings on editable nodes for the admin Canvas round trip.
    n.templateBinding = { text: template.text, src: template.src, color: template.color, fill: template.fill, stroke: template.stroke, fontFamily: template.fontFamily, stops: template.stops, minFontSize: template.minFontSize, highlight: template.highlight, highlightCount: template.highlightCount, optional: template.optional, fillAlpha: template.fillAlpha }
    delete n.highlight; delete n.highlightCount; delete n.minFontSize; delete n.optional; delete n.fillAlpha
    return [n]
  })
  return { width: family.width, height: family.height, background: tokens[variant.background], nodes, groups: [], classes }
}

export const SAMPLE_COPY = { headline: 'Make your next move matter', body: 'A thoughtful approach turns a clear idea into meaningful progress. Start with one practical step and build from there.', cta: 'Explore more', eyebrow: 'Start here', author: 'Your name', steps: ['Decide', 'Start', 'Keep going', 'Finish'] }

/** Preserve semantic bindings while accepting geometry/type edits from the existing Canvas. */
export function templateFromCanvas(family: GlobalDesignFamily, variant: DesignVariant, canvas: any): DesignVariant {
  const tokens = resolveBrandTokens({}, family)
  const previous = new Map(variant.nodes.map(n => [n.id, n]))
  const semantic = (value: string, fallback: string) => Object.entries(tokens).find(([key, resolved]) => resolved === value && key.startsWith('brand.'))?.[0] || fallback
  const nodes = (canvas.nodes || []).map((n: any) => {
    const old = previous.get(n.id)
    const bindingKeys = ['text', 'src', 'color', 'fill', 'stroke', 'fontFamily', 'stops', 'minFontSize', 'highlight', 'highlightCount', 'optional', 'fillAlpha']
    const bindings = n.templateBinding || Object.fromEntries(bindingKeys.filter(key => (old as any)?.[key] !== undefined).map(key => [key, (old as any)[key]]))
    const result = { ...n, ...Object.fromEntries(Object.entries(bindings).filter(([, value]) => value !== undefined)) }
    for (const key of ['color', 'fill', 'stroke']) if (n[key] && !bindings[key]) result[key] = semantic(n[key], key === 'fill' ? 'brand.accent' : 'brand.textPrimary')
    if (n.type === 'text') { result.fontFamily = bindings.fontFamily || 'brand.bodyFont'; result.text = /\{\{.+\}\}/.test(n.text) ? n.text : bindings.text || '{{body}}' }
    if (n.type === 'image') result.src = bindings.src || '{{image.primary}}'
    if (n.stops && !bindings.stops) result.stops = n.stops.map((s: any) => ({ ...s, color: semantic(s.color, 'brand.overlay') }))
    delete result.templateBinding
    return result
  })
  return { ...variant, nodes, background: canvas.background === tokens[variant.background] ? variant.background : semantic(canvas.background, variant.background) as DesignVariant['background'] }
}
