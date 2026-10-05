/**
 * Composition planner: study grammar + brand + content → editable Canvas nodes.
 * The study supplies relationships (scale, alignment, density, decoration, imagery behaviour);
 * this module decides concrete coordinates from the actual content. No model calls, no templates.
 */
import { resolveBrandTokens, countLines, clean, lightness, on, hex } from './resolve'
import { familyGrammar, familyImagery } from './study'
import type { GlobalDesignFamily, DesignGrammar, Composition } from './types'

type Align = 'left' | 'center' | 'right'
type Anchor = 'top' | 'center' | 'bottom'
type ImagePos = 'full' | 'top' | 'bottom' | 'left' | 'right' | 'center'
type Box = { x: number; y: number; width: number; height: number }
export interface SlidePlan { composition: Composition; withImage: boolean; align: Align; anchor: Anchor; imagePos: ImagePos; surface: 'dark' | 'light' | 'brand'; beat?: number }

const IMAGE_CAPABLE: Composition[] = ['image-led', 'split', 'stacked']
const TEXT_ONLY: Composition[] = ['statement', 'stacked', 'backdrop-type', 'list', 'closing']
const hash = (text: string) => [...text].reduce((n, c) => (Math.imul(n, 31) + c.charCodeAt(0)) >>> 0, 7)
const slidesOf = (copy: any) => Array.isArray(copy?.slides) && copy.slides.length ? copy.slides : [copy || {}]

/** Items of a list slide: explicit arrays, or numbered/bulleted body lines. */
export function listItems(slide: any): string[] {
  const explicit = Array.isArray(slide?.items) ? slide.items : Array.isArray(slide?.steps) ? slide.steps : null
  if (explicit) return explicit.map((s: any) => clean(s).trim()).filter(Boolean).slice(0, 6)
  const lines = String(slide?.body || slide?.supportingText || '').split('\n').map(l => l.trim()).filter(Boolean)
  const marked = lines.filter(l => /^(?:[-•–]|\d+[.)])\s+/.test(l))
  return marked.length >= 2 ? marked.map(l => clean(l.replace(/^(?:[-•–]|\d+[.)])\s+/, ''))).slice(0, 6) : []
}

/**
 * Chooses a composition per slide inside the grammar. A model-proposed composition is honoured when the
 * grammar allows it; otherwise selection is deterministic for the same copy. Consecutive slides avoid
 * repeating the same composition so a carousel varies while keeping one visual language.
 */
export function planSlides(family: GlobalDesignFamily, copy: any): SlidePlan[] {
  const g = familyGrammar(family), imagery = familyImagery(family), slides = slidesOf(copy)
  const hasImagery = imagery.mode !== 'none'
  const plans: SlidePlan[] = []
  slides.forEach((slide: any, index: number) => {
    const total = slides.length, last = total > 1 && index === total - 1
    const seed = hash(String(slide?.headline || '') + index)
    const proposed = g.compositions.includes(slide?.design?.composition) ? slide.design.composition as Composition : undefined
    const listy = listItems(slide).length >= 2
    const frequencyWants = { every: true, most: index === 0 || (!last && !listy), some: index % 2 === 0 && !last, rare: index === 0, never: false }[g.imagery.frequency]
    let wantImage = hasImagery && (proposed ? proposed === 'image-led' || proposed === 'split' || (proposed === 'stacked' && (slide?.design?.image ? true : frequencyWants)) : slide?.design?.image === null ? g.imagery.frequency === 'every' : frequencyWants)
    const pool = (image: boolean) => g.compositions.filter(c => image ? IMAGE_CAPABLE.includes(c) : TEXT_ONLY.includes(c))
    if (wantImage && !pool(true).length) wantImage = false
    let composition: Composition
    if (proposed && (wantImage ? IMAGE_CAPABLE : TEXT_ONLY).includes(proposed)) composition = proposed
    else {
      const options = pool(wantImage)
      const prefer = (...wanted: Composition[]) => wanted.find(c => options.includes(c))
      const previous = plans[index - 1]?.composition
      const used = (c: Composition) => plans.filter(p => p.composition === c).length
      const eligible = options.filter(c => c !== previous && (c !== 'list' || listy) && (c !== 'closing' || last))
      const fewest = Math.min(...eligible.map(used))
      const rotating = eligible.filter(c => used(c) === fewest)
      composition = (index === 0 ? prefer(wantImage ? 'image-led' : 'backdrop-type', wantImage ? 'split' : 'statement', 'stacked') : undefined)
        || (listy && !wantImage ? prefer('list') : undefined)
        || (last && !wantImage ? prefer('closing') : undefined)
        || rotating[seed % Math.max(1, rotating.length)] || options[0] || 'statement'
    }
    const positions = g.imagery.positions as ImagePos[]
    const sides = composition === 'split' ? positions.filter(p => p === 'left' || p === 'right') : composition === 'stacked' ? positions.filter(p => p === 'top' || p === 'bottom') : positions
    const imagePos: ImagePos = composition === 'image-led' ? (positions.includes('full') ? 'full' : positions[0])
      : sides.length ? sides[(index + seed) % sides.length] : composition === 'split' ? (index % 2 ? 'left' : 'right') : (index % 2 ? 'top' : 'bottom')
    const alignments = composition === 'split' || composition === 'list' ? g.alignment.filter(a => a !== 'center') : g.alignment
    const align = (index === 0 ? alignments[0] : alignments[(index + seed) % Math.max(1, alignments.length)]) || 'left'
    const anchors = g.anchors as Anchor[]
    const anchor = index === 0 ? anchors[0] : anchors[(index + seed) % anchors.length]
    // Surfaces: the dominant role carries the family; a second role marks the closing beat when the study allows one.
    const surface = (last && g.surfaces.length > 1 ? g.surfaces[1] : g.surfaces[0]) as SlidePlan['surface']
    plans.push({ composition, withImage: wantImage, align, anchor, imagePos, surface, beat: plans.filter(p => p.withImage).length })
  })
  return plans
}

// ---------------------------------------------------------------- color

const mix = (a: string, b: string, t: number) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('')
const alpha = (color: string, pct: number) => color.slice(0, 7) + Math.round(Math.max(0, Math.min(100, pct)) * 2.55).toString(16).padStart(2, '0')
const contrast = (a: string, b: string) => (Math.max(lightness(a), lightness(b)) + .05) / (Math.min(lightness(a), lightness(b)) + .05)

/** Maps the study's color roles to the current brand. Reference colors never enter here. */
export function brandPalette(tokens: Record<string, string>, surfaceRole: SlidePlan['surface']) {
  const brand = [...new Set(['brand.primary', 'brand.secondary', 'brand.accent', 'brand.background', 'brand.textPrimary'].map(k => tokens[k]).filter(c => hex(c)))]
  const darkest = brand.reduce((a, b) => lightness(b) < lightness(a) ? b : a, brand[0] || '#101010')
  const lightest = brand.reduce((a, b) => lightness(b) > lightness(a) ? b : a, brand[0] || '#ffffff')
  // The dominant dark is the brand's own dark color; a brand without one gets its main color deepened, not a generic black.
  const chromatic = [tokens['brand.primary'], tokens['brand.secondary'], tokens['brand.accent']].filter(c => hex(c))
  const deepest = chromatic.reduce((a, b) => lightness(b) < lightness(a) ? b : a, chromatic[0] || darkest)
  const dark = lightness(deepest) < .05 ? deepest : tokens['brand.textPrimary'] !== '#101010' && lightness(tokens['brand.textPrimary']) < .05 ? tokens['brand.textPrimary'] : mix(deepest, '#000000', .72)
  const light = lightness(lightest) > .75 ? lightest : mix(lightest, '#ffffff', .9)
  const surface = surfaceRole === 'dark' ? dark : surfaceRole === 'brand' ? tokens['brand.primary'] : light
  const readable = (c: string, min: number) => contrast(c, surface) >= min
  const foreground = [tokens['brand.textPrimary'], light, dark].find(c => readable(c, 4.5)) || on(surface)
  // The accent keeps the brand's hue: a brand color too close to the surface is tinted toward legibility, not replaced.
  const toward = lightness(surface) < .4 ? '#ffffff' : '#000000'
  const legible = (c: string) => { for (let t = 0; t <= .6; t += .05) { const tinted = t ? mix(c, toward, t) : c; if (readable(tinted, 3)) return tinted } return null }
  const accent = [tokens['brand.accent'], tokens['brand.primary'], tokens['brand.secondary']].filter(c => hex(c) && c !== surface && contrast(c, surface) > 1.1).map(legible).find(Boolean) || foreground
  const onAccent = [dark, light].find(c => contrast(c, accent) >= 4.5) || on(accent)
  return { surface, foreground, accent, onAccent, dark, light, muted: mix(foreground, surface, .22), tone: mix(surface, foreground, .12) }
}

// ---------------------------------------------------------------- composition

const HEADLINE = { medium: .072, large: .092, veryLarge: .116, oversized: .145 }
const BODY = { small: .029, medium: .034, large: .041 }
const MARGIN = { tight: .06, standard: .08, generous: .105 }
const DENSITY = { airy: 1.35, balanced: 1, dense: .72 }
const IMAGE_SHARE = { none: 0, small: .3, medium: .38, large: .46, dominant: .56 }
const WEIGHT = { regular: 400, bold: 700, black: 900 }
const LEADING = { tight: 1.02, normal: 1.12, loose: 1.25 }

interface ComposeOptions { preview?: boolean; image?: string; logo?: boolean }
interface TextSpec { role: string; text: string; font: string; size: number; min: number; weight: number; lineHeight: number; letterSpacing?: number; color: string; uppercase?: boolean; italic?: boolean; highlight?: 'color' | 'background'; pad?: number }

function emphasize(text: string, slide: any, kind: 'color' | 'background') {
  const words = text.split(/\s+/)
  const requested = Array.isArray(slide.emphasis) ? slide.emphasis.map((w: any) => clean(w).toLowerCase()) : []
  // Without a planned word, accent the most substantial word (longest, later on ties), never a short article.
  const strip = (w: string) => w.replace(/[^\p{L}\p{N}]/gu, '')
  const fallback = words.map((w, i) => ({ w, i, n: strip(w).length })).filter(x => x.n >= 4).sort((a, b) => b.n - a.n || b.i - a.i)[0]?.w || words[words.length - 1]
  const selected = requested.length ? words.filter(w => requested.includes(strip(w).toLowerCase()) || requested.includes(w.toLowerCase())).slice(0, 2) : [fallback]
  return text.split(/(\s+)/).map(word => selected.includes(word) ? `<%kind:${kind === 'background' ? 'family-highlight' : 'family-emphasis'}:${word}%>` : word).join('')
}

/** Shrinks a group of text blocks together until it fits the zone; complete copy is never cut. */
function fitGroup(specs: TextSpec[], width: number, height: number, gap: number) {
  for (let scale = 1; scale >= .3; scale -= .03) {
    const sized = specs.map(s => {
      const size = Math.max(s.min, Math.round(s.size * scale))
      const text = s.uppercase ? s.text.toUpperCase() : s.text
      const usable = width - 8 - (s.pad || 0)
      const lines = countLines(text, size, usable, s.font, s.letterSpacing || 0)
      const wordsFit = text.split(/\s+/).every(word => !word || countLines(word, size, usable, s.font, s.letterSpacing || 0) === 1)
      return { ...s, text, size, wordsFit, height: Math.ceil(lines * size * s.lineHeight + 10) }
    })
    const total = sized.reduce((n, s) => n + s.height, 0) + gap * (sized.length - 1)
    if (total <= height && sized.every(s => s.wordsFit)) return { sized, total }
    if (sized.every(s => s.size === s.min)) break
  }
  throw Object.assign(new Error(`The ${specs[0]?.role || 'slide'} copy is too long for this design. Shorten it or split it into another slide.`), { status: 422 })
}

/** Deterministic image frame for a plan, shared with asset planning so briefs match the final crop. */
export function imageFrame(family: GlobalDesignFamily, plan: SlidePlan): Box | null {
  if (!plan.withImage) return null
  const g = familyGrammar(family), W = family.width, H = family.height
  const M = Math.round(W * MARGIN[g.margin]), bleed = g.imagery.overlap !== 'none' || g.imagery.shape === 'rect'
  const share = (IMAGE_SHARE[g.imagery.scale] || .46) * ((plan.beat || 0) % 2 ? .82 : 1.08)
  if (plan.composition === 'image-led') {
    if (plan.imagePos === 'full') return { x: 0, y: 0, width: W, height: H }
    const h = Math.round(H * Math.min(.6, Math.max(.45, share)))
    return plan.imagePos === 'top' ? { x: 0, y: 0, width: W, height: h } : { x: 0, y: H - h, width: W, height: h }
  }
  if (plan.composition === 'split') {
    const w = Math.round(W * Math.min(.48, Math.max(.38, share * .85)))
    const x = plan.imagePos === 'left' ? (bleed ? 0 : M) : (bleed ? W - w : W - M - w)
    return bleed ? { x, y: 0, width: w, height: H } : { x, y: M, width: w - M / 2, height: H - 2 * M }
  }
  const h = Math.round(H * Math.min(.5, Math.max(.3, share)))
  const y = plan.imagePos === 'top' ? (bleed ? 0 : M) : (bleed ? H - h : H - M - h)
  return bleed ? { x: 0, y, width: W, height: h } : { x: M, y, width: W - 2 * M, height: h }
}

/** Builds one editable slide. Throws 422 when copy cannot fit readably. */
export function composeSlide(family: GlobalDesignFamily, brand: any, slide: any, plan: SlidePlan, index: number, total: number, options: ComposeOptions = {}) {
  const g: DesignGrammar = familyGrammar(family), imagery = familyImagery(family)
  const W = family.width, H = family.height
  const tokens = resolveBrandTokens(brand, family)
  const p = brandPalette(tokens, plan.surface)
  const heading = tokens['brand.headingFont'], bodyFont = tokens['brand.bodyFont']
  const M = Math.round(W * MARGIN[g.margin]), gap = Math.round(W * .034 * DENSITY[g.density])
  const nodes: any[] = []
  let n = 0
  const id = (role: string) => `${role}-${++n}`
  const push = (role: string, node: any) => { nodes.push({ id: id(role), designRole: role, ...node }); return nodes[nodes.length - 1] }

  // Image and the colors that sit on it.
  let frame = imageFrame(family, plan)
  const cutout = imagery.mode === 'cutout'
  const textOnImage = !!frame && plan.composition === 'image-led' && plan.imagePos === 'full' && !cutout
  const fg = textOnImage ? '#ffffff' : p.foreground
  const accent = textOnImage ? (contrast(p.accent, p.dark) >= 3 ? p.accent : '#ffffff') : p.accent
  const muted = textOnImage ? '#ffffffd9' : p.muted

  // Branding rows reserve their own bands so content never collides with them.
  const logoUrl = typeof brand.logo === 'string' && brand.logo ? brand.logo : ''
  const variants = brand.logoVariants?.source === logoUrl ? brand.logoVariants : null
  const onDark = textOnImage || lightness(p.surface) < .4
  const branding = [
    { kind: 'logo', pos: g.branding.logo },
    { kind: 'number', pos: total > 1 ? g.branding.slideNumber : 'none' },
    { kind: 'handle', pos: g.branding.handle },
  ].filter((b, i, all) => b.pos !== 'none' && all.findIndex(o => o.pos === b.pos) === i)
  const band = Math.round(W * .05)
  const topBand = branding.some(b => b.pos.startsWith('top')) ? band + gap : 0
  const bottomBand = branding.some(b => b.pos.startsWith('bottom')) ? band + gap : 0
  const content: Box = { x: M, y: M + topBand, width: W - 2 * M, height: H - 2 * M - topBand - bottomBand }

  // Text zone: the part of the content box the composition leaves for copy.
  let zone: Box = { ...content }
  if (frame && !textOnImage) {
    if (plan.composition === 'split') {
      zone = plan.imagePos === 'left' ? { ...content, x: frame.x + frame.width + gap, width: W - M - (frame.x + frame.width + gap) } : { ...content, width: frame.x - gap - M }
    } else if (frame.y <= M + 1) {
      const top = frame.y + frame.height + gap
      zone = { ...content, y: Math.max(top, content.y), height: content.y + content.height - Math.max(top, content.y) }
    } else zone = { ...content, height: frame.y - gap - content.y }
  }

  // Copy.
  const headlineRatio = HEADLINE[g.headline.scale] * (plan.composition === 'list' ? .78 : plan.composition === 'image-led' ? .9 : plan.composition === 'backdrop-type' ? .88 : 1) * (frame && !textOnImage ? .82 : 1)
  const hSize = Math.round(W * headlineRatio), bSize = Math.round(W * BODY[g.body.scale])
  const headlineText = clean(slide.headline || slide.title).trim()
  const items = plan.composition === 'list' ? listItems(slide) : []
  const bodyText = clean(items.length && !Array.isArray(slide.items) && !Array.isArray(slide.steps) ? '' : slide.body || slide.supportingText).trim()
  const eyebrowText = clean(slide.eyebrow || slide.subheadline).trim()
  const ctaText = clean(slide.cta).trim()
  const emphasis = g.emphasis === 'none' ? undefined : g.emphasis === 'background' ? 'background' as const : 'color' as const
  const specs: TextSpec[] = []
  if (eyebrowText) specs.push({ role: 'eyebrow', text: eyebrowText, font: bodyFont, size: Math.round(bSize * .8), min: 18, weight: 600, lineHeight: 1.2, letterSpacing: 2, color: accent, uppercase: true })
  if (headlineText) specs.push({ role: 'headline', text: headlineText, font: heading, size: hSize, min: Math.max(34, Math.round(hSize * .42)), weight: WEIGHT[g.headline.weight], lineHeight: LEADING[g.headline.leading], letterSpacing: g.headline.tracking === 'tight' ? -Math.round(hSize * .025) : g.headline.tracking === 'wide' ? Math.round(hSize * .04) : 0, color: fg, uppercase: g.headline.case === 'uppercase', highlight: emphasis, pad: emphasis === 'background' ? 28 : 0 })
  if (bodyText) specs.push({ role: 'body', text: bodyText, font: bodyFont, size: bSize, min: 22, weight: 400, lineHeight: 1.32, color: textOnImage ? '#ffffff' : mix(fg, p.surface, .12) })

  const ctaStyle = g.cta, ctaHeight = ctaText ? Math.round(bSize * (ctaStyle === 'pill' ? 2.1 : 1.6)) : 0
  const ctaProminent = plan.composition === 'closing'
  if (frame && !textOnImage && plan.composition !== 'split' && frame.width >= W * .9) {
    const comfortable = specs.map(s => ({ ...s, size: Math.round(s.size * .82), min: Math.round(s.size * .82) }))
    const reserve = (ctaText ? ctaHeight + gap : 0) + (g.decorations.some(d => d.kind === 'line') ? Math.round(W * .012) + gap : 0)
    let need = 0
    try { need = fitGroup(comfortable, zone.width, 10000, gap).total + reserve } catch { need = 0 }
    const shortfall = need - zone.height
    const give = Math.min(Math.max(0, shortfall), frame.height - Math.round(H * .3))
    if (give > 0) {
      const top = frame.y <= M + 1
      frame = top ? { ...frame, height: frame.height - give } : { ...frame, y: frame.y + give, height: frame.height - give }
      zone = top ? { ...zone, y: zone.y + give, height: zone.height + give } : { ...zone, height: zone.height + give }
    }
  }

  const textNode = (spec: any, box: Box, align: Align) => push(spec.role, {
    type: 'text', ...box, text: spec.highlight ? emphasize(spec.text, slide, spec.highlight) : spec.text,
    fontFamily: spec.font, fontSize: spec.size, fontWeight: spec.weight, lineHeight: spec.lineHeight, letterSpacing: spec.letterSpacing || 0,
    color: spec.color, textAlign: align, ...(spec.italic ? { fontStyle: 'italic' } : {}),
  })

  // Decorations sit behind everything and keep to the side the copy does not use.
  const freeCorners = (() => {
    const vertical = plan.anchor === 'top' ? ['bottom'] : plan.anchor === 'bottom' ? ['top'] : ['top', 'bottom']
    const horizontal = plan.align === 'left' ? ['right'] : plan.align === 'right' ? ['left'] : ['left', 'right']
    return vertical.flatMap(v => horizontal.map(h => `${v}-${h}`))
  })()
  const decorations = g.decorations.filter(d => d.frequency === 'every' || index % 2 === 0)
  const decoColor = (d: any) => alpha(d.color === 'accent' ? accent : d.color === 'foreground' ? fg : (textOnImage ? '#ffffff' : p.tone), d.color === 'surfaceTone' ? Math.max(d.opacity, 60) : d.opacity)
  const sizeOf = (scale: string) => W * ({ small: .16, medium: .3, large: .5, oversized: .78 } as any)[scale]
  const behind: any[] = []
  decorations.forEach((d, i) => {
    const corner = freeCorners[(i + index) % freeCorners.length]
    const [v, h] = corner.split('-')
    const size = sizeOf(d.scale)
    const cx = h === 'left' ? (d.placement === 'edge' ? 0 : M + size / 2) : (d.placement === 'edge' ? W : W - M - size / 2)
    const cy = v === 'top' ? (d.placement === 'edge' ? 0 : M + size / 2) : (d.placement === 'edge' ? H : H - M - size / 2)
    const color = decoColor(d)
    if (d.kind === 'ring' || d.kind === 'circle') behind.push({ role: 'decoration', type: 'shape', shape: 'ellipse', x: cx - size / 2, y: cy - size / 2, width: size, height: size, fill: d.kind === 'ring' ? '#00000000' : color, ...(d.kind === 'ring' ? { stroke: color, strokeWidth: Math.max(4, Math.round(size * .022)) } : {}) })
    else if (d.kind === 'arc') { const r = W * 1.05; behind.push({ role: 'decoration', type: 'shape', shape: 'ellipse', x: (h === 'left' ? -r * .62 : W - r * .38), y: (v === 'top' ? -r * .62 : H - r * .38), width: r, height: r, fill: '#00000000', stroke: color, strokeWidth: Math.max(3, Math.round(W * .006)) }) }
    else if (d.kind === 'glow') behind.push({ role: 'decoration', type: 'gradient', gradientType: 'radial', x: cx - size, y: cy - size, width: size * 2, height: size * 2, stops: [{ color: color.slice(0, 7), position: 0, alpha: d.opacity }, { color: color.slice(0, 7), position: 70, alpha: 0 }] })
    else if (d.kind === 'cornerBlock') { const s = Math.round(W * .13); behind.push({ role: 'decoration', type: 'shape', shape: 'rect', x: h === 'left' ? 0 : W - s, y: v === 'top' ? 0 : H - s, width: s, height: s, fill: color }) }
    else if (d.kind === 'frame') { const inset = Math.round(M * .45); behind.push({ role: 'decoration', type: 'shape', shape: 'rect', x: inset, y: inset, width: W - 2 * inset, height: H - 2 * inset, fill: '#00000000', stroke: color, strokeWidth: Math.max(2, Math.round(W * .003)) }) }
    else if (d.kind === 'dotGrid') {
      const field = d.scale === 'oversized', step = Math.round(W * (field ? .045 : .034)), dot = Math.max(4, Math.round(W * .007))
      const cols = field ? Math.ceil(W / step) : 6, rows = field ? Math.ceil(H / step) : 6
      const x0 = field ? step / 2 : (h === 'left' ? M : W - M - step * (cols - 1)), y0 = field ? step / 2 : (v === 'top' ? M + topBand : H - M - bottomBand - step * (rows - 1))
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        // Large fields fade toward the copy so texture never competes with it.
        const fade = field ? 1 - (v === 'top' ? r / rows : 1 - r / rows) * .85 : 1
        behind.push({ role: 'decoration', type: 'shape', shape: 'ellipse', x: x0 + c * step - dot / 2, y: y0 + r * step - dot / 2, width: dot, height: dot, fill: alpha(color, d.opacity * fade) })
      }
    }
  })
  // Oversized background typography: from the study, or always for the backdrop-type composition.
  const backdrop = g.decorations.find(d => d.kind === 'oversizedType')
  if (plan.composition === 'backdrop-type' || (backdrop && (backdrop.frequency === 'every' || index % 2 === 0))) {
    const word = (headlineText.split(/\s+/).sort((a, b) => b.length - a.length)[0] || String(index + 1)).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 9) || String(index + 1).padStart(2, '0')
    const glyph = total > 1 && plan.composition !== 'backdrop-type' ? String(index + 1).padStart(2, '0') : word.toUpperCase()
    const size = Math.round(Math.min(H * .42, (W * .96) / Math.max(1, glyph.length * .74)))
    const y = plan.anchor === 'top' ? H - M - bottomBand - size : plan.anchor === 'bottom' ? M + topBand : (H - size) / 2
    behind.push({ role: 'backdrop-type', type: 'text', x: Math.round(W * .02), y: Math.max(0, Math.round(y)), width: Math.round(W * .96), height: Math.round(size * 1.02), text: glyph, fontFamily: heading, fontSize: size, fontWeight: 900, lineHeight: 1, letterSpacing: -Math.round(size * .03), color: alpha(textOnImage ? '#ffffff' : fg, Math.min(14, backdrop?.opacity ?? 9)), textAlign: plan.align === 'right' ? 'right' : plan.align === 'center' ? 'center' : 'left' })
  }
  if (!frame || !textOnImage) for (const d of behind) push(d.role, d)

  // Imagery.
  if (frame) {
    const radius = g.imagery.shape === 'rounded' ? Math.round(W * .03) : 0
    const mask = g.imagery.shape === 'circle' ? 'circle' : g.imagery.shape === 'pill' || g.imagery.shape === 'arch' ? 'rounded' : undefined
    if (options.image) push('image', { type: 'image', ...frame, src: options.image, objectFit: cutout ? 'contain' : 'cover', ...(radius ? { borderRadius: radius } : {}), ...(mask && !cutout ? { mask } : {}) })
    else if (options.preview) push('image-placeholder', { type: 'shape', shape: 'rect', ...frame, fill: textOnImage ? mix(p.dark, '#808080', .25) : p.tone, borderRadius: radius })
    else throw Object.assign(new Error('This design needs a photograph. Resolve the image before generating the canvas.'), { status: 409 })
    if (textOnImage && g.imagery.overlay !== 'none') {
      const solid = g.imagery.overlay === 'solid' || plan.anchor === 'center'
      push('overlay', { type: 'gradient', gradientType: 'linear', ...frame, angle: plan.anchor === 'top' ? 0 : 180, stops: solid ? [{ color: p.dark, position: 0, alpha: 52 }, { color: p.dark, position: 100, alpha: 52 }] : [{ color: p.dark, position: 0, alpha: 8 }, { color: p.dark, position: 55, alpha: 38 }, { color: p.dark, position: 100, alpha: 88 }] })
    } else if (textOnImage) push('overlay', { type: 'gradient', gradientType: 'linear', ...frame, angle: plan.anchor === 'top' ? 0 : 180, stops: [{ color: p.dark, position: 0, alpha: 0 }, { color: p.dark, position: 100, alpha: 70 }] })
    if (textOnImage) for (const d of behind.filter(d => d.role === 'backdrop-type')) push(d.role, d)
  }

  // Copy placement.
  const align = plan.align
  const ctaReserve = ctaText ? ctaHeight + gap : 0
  const lineAccent = g.decorations.find(d => d.kind === 'line')
  const lineReserve = lineAccent ? Math.round(W * .012) + gap : 0
  if (plan.composition === 'list' && items.length) {
    const head = specs.filter(s => s.role !== 'body')
    const headFit = fitGroup(head, zone.width, Math.round(zone.height * .4), Math.round(gap * .6))
    const ring = g.decorations.some(d => d.kind === 'ring' || d.kind === 'circle')
    const itemSize = Math.round(bSize * 1.2), marker = Math.round(itemSize * 1.6), textX = zone.x + marker + Math.round(gap * .7)
    const rowGap = Math.round(gap * .8)
    const listHeight = zone.height - ctaReserve - lineReserve - headFit.total - gap * 1.4
    const itemSpecs = items.map(text => ({ role: 'item', text, font: bodyFont, size: itemSize, min: 20, weight: 500, lineHeight: 1.25, color: fg }))
    const fit = fitGroup(itemSpecs, zone.x + zone.width - textX, listHeight, rowGap)
    const rows = fit.sized.map(s => Math.max(s.height, marker))
    const groupHeight = lineReserve + headFit.total + gap * 1.4 + rows.reduce((n, h) => n + h, 0) + rowGap * (rows.length - 1) + ctaReserve
    let y = Math.round(plan.anchor === 'top' ? zone.y : plan.anchor === 'bottom' ? zone.y + zone.height - groupHeight : zone.y + (zone.height - groupHeight) / 2)
    if (lineAccent) { push('accent-line', { type: 'shape', shape: 'rect', x: zone.x, y, width: Math.round(W * .12), height: Math.max(6, Math.round(W * .008)), fill: accent }); y += lineReserve }
    for (const s of headFit.sized) { textNode(s, { x: zone.x, y, width: zone.width, height: s.height }, align); y += s.height + Math.round(gap * .6) }
    y += Math.round(gap * .8)
    fit.sized.forEach((s, i) => {
      const rowH = rows[i]
      if (ring) push('marker', { type: 'shape', shape: 'ellipse', x: zone.x, y: y + (rowH - marker) / 2, width: marker, height: marker, fill: '#00000000', stroke: accent, strokeWidth: Math.max(3, Math.round(marker * .08)) })
      else push('marker', { type: 'shape', shape: 'rect', x: zone.x, y: y + (rowH - marker) / 2, width: marker, height: marker, fill: accent, borderRadius: Math.round(marker * .22) })
      push('marker-number', { type: 'text', x: zone.x, y: y + (rowH - marker) / 2, width: marker, height: marker, text: String(i + 1), fontFamily: heading, fontSize: Math.round(marker * .48), fontWeight: 700, lineHeight: 1, color: ring ? accent : p.onAccent, textAlign: 'center' })
      textNode(s, { x: textX, y: y + (rowH - s.height) / 2, width: zone.x + zone.width - textX, height: s.height }, 'left')
      y += rowH + rowGap
    })
    if (ctaText) placeCta(y - rowGap + gap)
  } else {
    // Stacked text-only slides spread the copy: headline to one edge, supporting copy to the other.
    const spread = plan.composition === 'stacked' && !frame && specs.length > 1
    const textBudget = zone.height - ctaReserve - lineReserve
    const fit = fitGroup(specs, zone.width, Math.max(120, textBudget - (spread ? gap * 2 : 0)), gap)
    let y = plan.anchor === 'top' || spread ? zone.y : plan.anchor === 'bottom' ? zone.y + zone.height - fit.total - ctaReserve - lineReserve : zone.y + (zone.height - fit.total - ctaReserve - lineReserve) / 2
    y = Math.max(zone.y, Math.round(y))
    if (lineAccent) { push('accent-line', { type: 'shape', shape: 'rect', x: align === 'center' ? W / 2 - W * .06 : align === 'right' ? zone.x + zone.width - W * .12 : zone.x, y, width: Math.round(W * .12), height: Math.max(6, Math.round(W * .008)), fill: accent }); y += lineReserve }
    const pill = g.decorations.find(d => d.kind === 'pill')
    fit.sized.forEach((s, i) => {
      if (spread && s.role === 'body') y = Math.max(y, zone.y + zone.height - ctaReserve - fit.sized.slice(i).reduce((n, o) => n + o.height + gap, -gap))
      if (s.role === 'eyebrow' && pill) {
        const textW = Math.min(zone.width, Math.round(s.text.length * s.size * .68 + s.size * 1.6))
        const px = align === 'center' ? W / 2 - textW / 2 : align === 'right' ? zone.x + zone.width - textW : zone.x
        push('eyebrow-pill', { type: 'shape', shape: 'rect', x: px, y: y - 4, width: textW, height: s.height + 8, fill: '#00000000', stroke: fg, strokeWidth: 3, borderRadius: Math.round((s.height + 8) / 2) })
        textNode(s, { x: px, y, width: textW, height: s.height }, 'center')
      } else textNode(s, { x: zone.x, y, width: zone.width, height: s.height }, align)
      y += s.height + gap
    })
    if (ctaText) placeCta(spread || plan.anchor === 'bottom' || ctaProminent ? Math.min(zone.y + zone.height - ctaHeight, y) : y)
  }

  function placeCta(y: number) {
    const size = Math.round(bSize * (ctaProminent ? 1.08 : .92))
    const width = Math.min(zone.width, Math.round(ctaText.length * size * .62 + size * (ctaStyle === 'pill' ? 2.4 : ctaStyle === 'arrow' ? 2 : .5)))
    const x = align === 'center' ? Math.round(W / 2 - width / 2) : align === 'right' ? zone.x + zone.width - width : zone.x
    if (ctaStyle === 'pill') push('cta-button', { type: 'shape', shape: 'rect', x, y, width, height: ctaHeight, fill: accent, borderRadius: Math.round(ctaHeight / 2) })
    push('cta', { type: 'text', x, y, width, height: ctaHeight, text: ctaStyle === 'arrow' ? `${ctaText} →` : ctaText, fontFamily: bodyFont, fontSize: size, fontWeight: 700, lineHeight: 1.1, color: ctaStyle === 'pill' ? (textOnImage ? on(accent) : p.onAccent) : accent, textAlign: ctaStyle === 'pill' ? 'center' : align })
    if (ctaStyle === 'underline') push('cta-underline', { type: 'shape', shape: 'rect', x, y: y + ctaHeight - 4, width: Math.min(width, Math.round(ctaText.length * size * .55)), height: 3, fill: accent })
  }

  // Branding: logo, slide number and handle in their studied corners.
  for (const b of branding) {
    const [v, h] = b.pos.split('-')
    const y = v === 'top' ? M : H - M - band
    const place = (width: number) => h === 'left' ? M : h === 'right' ? W - M - width : Math.round(W / 2 - width / 2)
    if (b.kind === 'logo') {
      if (logoUrl && options.logo !== false) {
        const src = (onDark ? variants?.whiteTransparent : variants?.originalTransparent) || logoUrl
        const width = Math.round(W * .2)
        push('logo', { type: 'image', x: place(width), y, width, height: band, src, objectFit: 'contain' })
      } else if (brand.name) {
        const width = Math.round(W * .45)
        push('brand-name', { type: 'text', x: place(width), y, width, height: band, text: clean(brand.name), fontFamily: heading, fontSize: Math.round(W * .026), fontWeight: 700, lineHeight: 1.1, color: fg, textAlign: h === 'center' ? 'center' : h })
      }
    } else if (b.kind === 'number') {
      const width = Math.round(W * .16)
      push('slide-number', { type: 'text', x: place(width), y, width, height: band, text: `${String(index + 1).padStart(2, '0')}`, fontFamily: heading, fontSize: Math.round(W * .03), fontWeight: 700, lineHeight: 1, color: accent, textAlign: h === 'center' ? 'center' : h })
    } else if (brand.website) {
      let site = clean(brand.website)
      try { site = new URL(site).hostname.replace(/^www\./, '') } catch {}
      const width = Math.round(W * .5)
      push('handle', { type: 'text', x: place(width), y, width, height: band, text: site, fontFamily: bodyFont, fontSize: Math.round(W * .022), fontWeight: 400, lineHeight: 1.1, color: muted, textAlign: h === 'center' ? 'center' : h })
    }
  }

  const classes = {
    'family-highlight': { background: accent, color: textOnImage ? on(accent) : p.onAccent, paddingX: 8, paddingY: 0 },
    'family-emphasis': { color: accent, fontWeight: 700 },
  }
  return { width: W, height: H, background: p.surface, nodes, groups: [], classes, composition: plan.composition }
}

/** Sample copy for library previews: four beats so a family shows several compositions, not one layout. */
export const SAMPLE_DECK = [
  { headline: 'Make your next move matter', body: 'A clear idea, one practical step.', eyebrow: 'Start here' },
  { headline: 'Small steps compound', body: 'Consistent effort beats occasional intensity. Pick one habit and protect it every day.' },
  { headline: 'Three moves to begin', body: '1. Decide what matters\n2. Start small today\n3. Review every week' },
  { headline: 'Ready when you are', body: 'Turn the idea into your next action.', cta: 'Explore more' },
]

/** Preview of one sample beat with placeholder imagery. */
export function previewSlide(family: GlobalDesignFamily, brand: any, sampleIndex = 0) {
  const deck = { format: 'carousel', slides: SAMPLE_DECK }
  const plans = planSlides(family, deck)
  const i = Math.max(0, Math.min(SAMPLE_DECK.length - 1, sampleIndex))
  try { return composeSlide(family, brand, SAMPLE_DECK[i], plans[i], i, SAMPLE_DECK.length, { preview: true }) }
  catch { return composeSlide(family, brand, { headline: SAMPLE_DECK[i].headline }, { ...plans[i], composition: 'statement', withImage: false }, i, SAMPLE_DECK.length, { preview: true }) }
}
