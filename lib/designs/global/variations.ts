import type { DesignVariant, GlobalDesignFamily, TemplateNode } from './types'

const clone = <T>(value: T): T => structuredClone(value)
const slotOf = (node: TemplateNode) => node.text?.match(/\{\{([^}]+)\}\}/)?.[1]
const isCopySlot = (node: TemplateNode) => ['headline', 'body', 'cta', 'eyebrow'].includes(slotOf(node) || '')
const area = (node: TemplateNode) => node.width * node.height

type Layout = {
  decor: 'native' | 'mirror' | 'inset' | 'rise' | 'fall' | 'left-photo' | 'right-photo' | 'top-photo' | 'bottom-photo'
  accent?: 'marker' | 'frame' | 'column' | 'band'
  headline: [number, number, number, number, number, TemplateNode['textAlign']?]
  body: [number, number, number, number, number, TemplateNode['textAlign']?]
  eyebrow?: [number, number, number, number, number, TemplateNode['textAlign']?]
  cta?: [number, number, number, number, number, TemplateNode['textAlign']?]
}

function sourceForSlot(variants: DesignVariant[], slot: string, fallback: TemplateNode) {
  const matches = variants.flatMap(variant => variant.nodes)
    .filter(node => node.type === 'text' && slotOf(node) === slot)
    .sort((a, b) => area(b) - area(a))
  return clone(matches[0] || fallback)
}

function semanticText(base: TemplateNode, id: string, slot: string, box: Layout['headline'], options: Partial<TemplateNode> = {}): TemplateNode {
  const [x, y, width, height, fontSize, textAlign = 'left'] = box
  return {
    ...clone(base), id, type: 'text', text: `{{${slot}}}`, x, y, width, height, fontSize, textAlign,
    minFontSize: Math.max(14, Math.min(base.minFontSize || Math.round(fontSize * .48), fontSize)),
    fontFamily: base.fontFamily || (slot === 'headline' ? 'brand.headingFont' : 'brand.bodyFont'),
    fontWeight: base.fontWeight || (slot === 'headline' ? 700 : 400), lineHeight: base.lineHeight || (slot === 'headline' ? 1.04 : 1.24),
    color: base.color || 'brand.textPrimary', ...(slot === 'headline' ? {} : { optional: true }), ...options,
  }
}

function compactDecor(nodes: TemplateNode[]) {
  if (nodes.length <= 440) return nodes
  const repeated = /(?:diamond|dot|grid|pattern|texture|motif)-?\d/i
  const essential = nodes.filter(node => !repeated.test(node.id))
  const field = nodes.filter(node => repeated.test(node.id))
  const stride = Math.max(1, Math.ceil(field.length / Math.max(1, 320 - essential.length)))
  return [...field.filter((_, index) => index % stride === 0), ...essential].slice(-440)
}

function enforceNodeBudget(nodes: TemplateNode[], maximum = 1500) {
  if (nodes.length <= maximum) return nodes
  const essential = (node: TemplateNode) => node.type !== 'shape' || /(?:doodle|scribble|hand|arrow|sparkle|oval|photo-outline|reference-photo-overlay|frame|headline|footer|logo)/i.test(node.id)
  const essentialIndexes = nodes.map((node, index) => essential(node) ? index : -1).filter(index => index >= 0)
  const decorativeIndexes = nodes.map((node, index) => !essential(node) ? index : -1).filter(index => index >= 0)
  const available = Math.max(0, maximum - essentialIndexes.length)
  const stride = Math.max(1, Math.ceil(decorativeIndexes.length / Math.max(1, available)))
  const kept = new Set([...essentialIndexes.slice(0, maximum), ...decorativeIndexes.filter((_, index) => index % stride === 0).slice(0, available)])
  return nodes.filter((_, index) => kept.has(index))
}

function lineNode(id: string, x1: number, y1: number, x2: number, y2: number, color: TemplateNode['fill'], thickness: number): TemplateNode {
  const dx = x2 - x1, dy = y2 - y1
  const length = Math.max(1, Math.hypot(dx, dy))
  return { id, type: 'shape', shape: 'rect', x: (x1 + x2) / 2 - length / 2, y: (y1 + y2) / 2 - thickness / 2,
    width: length, height: Math.max(1, thickness), rotation: Math.atan2(dy, dx) * 180 / Math.PI, fill: color || 'brand.accent', borderRadius: thickness }
}

/** Turn semantic doodle placeholders from vision reconstruction into editable artwork. */
function expandDoodle(node: TemplateNode): TemplateNode[] {
  const id = node.id.toLowerCase(), color = node.stroke || node.fill || 'brand.accent', thickness = Math.max(2, node.strokeWidth || node.height || 3)
  const explicitlyDrawn = /doodle|hand|scribble|accent/.test(id)
  if (explicitlyDrawn && /star|sparkle/.test(id) && node.type === 'shape') {
    const x = node.x, y = node.y, w = node.width, h = node.height
    const points = [[.5, 0], [.62, .38], [1, .5], [.62, .62], [.5, 1], [.38, .62], [0, .5], [.38, .38], [.5, 0]]
    return points.slice(0, -1).map((point, index) => lineNode(`${node.id}-seg-${index + 1}`, x + point[0] * w, y + point[1] * h, x + points[index + 1][0] * w, y + points[index + 1][1] * h, color, thickness))
  }
  if (explicitlyDrawn && /arrow/.test(id) && node.type === 'shape') {
    const x1 = node.x, x2 = node.x + node.width, y = node.y + node.height / 2, head = Math.max(18, Math.min(52, node.width * .18))
    return [lineNode(`${node.id}-shaft`, x1, y, x2, y, color, thickness), lineNode(`${node.id}-head-a`, x2 - head, y - head * .55, x2, y, color, thickness), lineNode(`${node.id}-head-b`, x2 - head, y + head * .55, x2, y, color, thickness)]
  }
  if (explicitlyDrawn && /oval|circle/.test(id) && node.type === 'shape') return [
    { ...node, fill: 'transparent', stroke: color, strokeWidth: thickness },
    { ...node, id: `${node.id}-echo`, x: node.x + 5, y: node.y - 3, width: Math.max(1, node.width - 8), height: node.height + 6, rotation: (node.rotation || 0) + 3, fill: 'transparent', stroke: color, strokeWidth: Math.max(1, thickness - 1) },
  ]
  if (explicitlyDrawn && /scribble/.test(id) && node.type === 'shape') {
    const x = node.x, y = node.y, w = node.width, h = Math.max(node.height, 32)
    return [0, 1, 2, 3].map(index => lineNode(`${node.id}-stroke-${index + 1}`, x + index * w * .07, y + index * h * .22, x + w - index * w * .05, y + h * (.18 + index * .20), color, thickness))
  }
  return [node]
}

function refineReferenceFamily(input: GlobalDesignFamily): GlobalDesignFamily {
  const photoDoodle = input.variants.some(variant => variant.nodes.some(node => node.src === '{{image.primary}}')) && /hand.drawn|doodle|scribble|script|neon/i.test(input.analysis || '')
  if (!photoDoodle) return input
  const yearRecap = /highlights of my year/i.test(input.analysis || '') && /4-point star/i.test(input.analysis || '')
  const typography = { ...input.typography,
    headingFallback: /condensed/i.test(input.analysis || '') ? 'Anton' : input.typography.headingFallback,
    accentFallback: input.typography.accentFallback || 'Caveat' }
  const variants = input.variants.map(variant => {
    const hasOverlay = variant.nodes.some(node => node.id === 'reference-photo-overlay')
    const nodes = variant.nodes.flatMap(node => {
      if (node.src === '{{image.primary}}') {
        const image = { ...node, filters: { ...node.filters, brightness: Math.min(node.filters?.brightness ?? 100, 84), contrast: Math.max(node.filters?.contrast ?? 100, 106), saturate: Math.min(node.filters?.saturate ?? 100, 94) } }
        if (hasOverlay || node.x !== 0 || node.y !== 0 || node.width < input.width * .9 || node.height < input.height * .9) return [image]
        return [image, { id: 'reference-photo-overlay', type: 'gradient' as const, x: 0, y: 0, width: input.width, height: input.height, gradientType: 'linear' as const, angle: 90,
          stops: [{ color: 'brand.overlay' as const, position: 0, alpha: 12 }, { color: 'brand.overlay' as const, position: 48, alpha: 27 }, { color: 'brand.overlay' as const, position: 100, alpha: 22 }] }]
      }
      const slot = slotOf(node)
      if (node.type === 'text' && slot === 'headline') return [{ ...node,
        ...(yearRecap && variant.role === 'cover' ? { x: 220, width: 640, height: 260, textAlign: 'center' as const } : {}),
        color: 'brand.onImage' as const, textTransform: 'uppercase' as const, fontWeight: Math.max(node.fontWeight || 700, 800), letterSpacing: node.letterSpacing ?? -2 }]
      if (node.type === 'text' && slot === 'body' && variant.role === 'cover') return [{ ...node, fontFamily: 'brand.accentFont' as const, color: 'brand.onImage' as const, fontWeight: 400, fontStyle: 'normal' as const, rotation: node.rotation ?? -7, lineHeight: Math.min(node.lineHeight || 1.15, 1.2) }]
      if (node.type === 'text' && slot === 'cta' && variant.role === 'cover' && node.y > input.height * .78) return [{ ...node, id: 'page-number', text: '{{number}}', x: input.width - 140, y: input.height - 62, width: 100, height: 30, fontSize: 14, minFontSize: 12, fontFamily: 'brand.bodyFont' as const, fontWeight: 600, textAlign: 'right' as const, letterSpacing: 2, lineHeight: 1.2, color: 'brand.onImage' as const, optional: true }]
      if (yearRecap && variant.role === 'cover' && /star|sparkle/i.test(node.id)) return expandDoodle({ ...node, x: 165, y: 365, width: 120, height: 120 })
      if (yearRecap && variant.role === 'cover' && /oval|circle/i.test(node.id)) return expandDoodle({ ...node, x: 500, y: 620, width: 420, height: 130 })
      if (yearRecap && variant.role === 'cover' && /arrow/i.test(node.id)) return expandDoodle({ ...node, x: 520, y: 930, width: 210 })
      return expandDoodle(node)
    })
    return { ...variant, nodes: enforceNodeBudget(nodes) }
  })
  return { ...input, typography, variants }
}

function transformDecor(source: DesignVariant, mode: Layout['decor'], width: number, height: number): TemplateNode[] {
  const native = compactDecor(source.nodes.filter(node => node.type !== 'text' || (!isCopySlot(node) && Boolean(slotOf(node)))))
  return native.map(original => {
    const node = clone(original)
    if (mode === 'native') return node
    if (mode === 'mirror') return { ...node, x: width - node.x - node.width, rotation: -(node.rotation || 0), cropLeft: node.cropRight, cropRight: node.cropLeft }
    if (mode === 'inset') {
      if (node.src === '{{image.primary}}') return { ...node, x: Math.round(width * .07), y: Math.round(height * .07), width: Math.round(width * .86), height: Math.round(height * .86), borderRadius: Math.max(node.borderRadius || 0, 20) }
      return { ...node, x: Math.round(width * .08 + node.x * .84), y: Math.round(height * .08 + node.y * .84), width: Math.max(1, Math.round(node.width * .84)), height: Math.max(1, Math.round(node.height * .84)) }
    }
    if (mode === 'rise' || mode === 'fall') {
      // Header/footer identity remains anchored to the reference grid while
      // the decorative field changes direction.
      if (node.type === 'text' || node.src === '{{brand.logo}}') return node
      const distance = Math.round(height * .16) * (mode === 'rise' ? -1 : 1)
      return { ...node, y: node.y + distance }
    }
    if (node.src !== '{{image.primary}}') return node
    if (mode === 'left-photo') return { ...node, x: 0, y: 0, width: Math.round(width * .48), height }
    if (mode === 'right-photo') return { ...node, x: Math.round(width * .52), y: 0, width: Math.round(width * .48), height }
    if (mode === 'top-photo') return { ...node, x: 0, y: 0, width, height: Math.round(height * .48) }
    if (mode === 'bottom-photo') return { ...node, x: 0, y: Math.round(height * .52), width, height: Math.round(height * .48) }
    return node
  })
}

function layoutFromSource(source: DesignVariant, family: GlobalDesignFamily, role: 'cover' | 'content'): Layout {
  const find = (slot: string) => source.nodes.find(node => slotOf(node) === slot)
  const box = (node: TemplateNode | undefined, fallback: Layout['headline']): Layout['headline'] => node
    ? [node.x, node.y, node.width, node.height, node.fontSize || fallback[4], node.textAlign] : fallback
  return {
    decor: 'native',
    headline: box(find('headline'), [90, role === 'cover' ? 300 : 260, family.width - 180, role === 'cover' ? 430 : 300, role === 'cover' ? 110 : 82]),
    body: box(find('body'), [90, role === 'cover' ? 790 : 650, family.width - 180, role === 'cover' ? 180 : 390, 32]),
    eyebrow: box(find('eyebrow'), [90, 210, family.width - 180, 48, 22]), cta: box(find('cta'), [90, family.height - 150, family.width - 180, 60, 24]),
  }
}

function createVariant(family: GlobalDesignFamily, source: DesignVariant, texts: Record<string, TemplateNode>, id: string, name: string, role: DesignVariant['role'], layout: Layout): DesignVariant {
  const nodes = transformDecor(source, layout.decor, family.width, family.height)
  const photo = nodes.find(node => node.src === '{{image.primary}}')
  if (photo && layout.decor !== 'native' && layout.decor !== 'mirror') nodes.push({ id: `photo-outline-${id}`, type: 'shape', shape: 'rect', x: photo.x, y: photo.y, width: photo.width, height: photo.height, fill: 'transparent', stroke: 'brand.accent', strokeWidth: 3, borderRadius: photo.borderRadius })
  const [hx, hy, hw, hh] = layout.headline
  if (layout.accent === 'marker') nodes.push(
    { id: `marker-a-${id}`, type: 'shape', shape: 'rect', x: Math.max(0, hx - 12), y: hy + Math.round(hh * .34), width: Math.min(family.width - hx, Math.round(hw * .62)), height: Math.max(18, Math.round(hh * .16)), fill: 'brand.accent', fillAlpha: 32, rotation: -2 },
    { id: `marker-b-${id}`, type: 'shape', shape: 'rect', x: Math.max(0, hx + Math.round(hw * .28)), y: hy + Math.round(hh * .68), width: Math.round(hw * .48), height: Math.max(14, Math.round(hh * .12)), fill: 'brand.accent', fillAlpha: 24, rotation: 1 },
  )
  if (layout.accent === 'frame') nodes.push({ id: `editorial-frame-${id}`, type: 'shape', shape: 'rect', x: Math.max(28, hx - 34), y: Math.max(140, hy - 42), width: Math.min(family.width - Math.max(28, hx - 34) - 28, hw + 68), height: Math.min(family.height - Math.max(140, hy - 42) - 130, hh + layout.body[3] + 150), fill: 'transparent', stroke: 'brand.accent', strokeWidth: 3, borderRadius: 8 })
  if (layout.accent === 'column') nodes.push({ id: `editorial-column-${id}`, type: 'shape', shape: 'rect', x: hx > family.width / 2 ? hx - 42 : hx + hw + 18, y: Math.max(150, hy - 28), width: 14, height: Math.min(family.height * .62, hh + layout.body[3] + 90), fill: 'brand.accent' })
  if (layout.accent === 'band') nodes.push({ id: `editorial-band-${id}`, type: 'shape', shape: 'rect', x: 0, y: Math.max(150, hy - 35), width: family.width, height: hh + 70, fill: 'brand.accent', fillAlpha: 16 })
  nodes.push(semanticText(texts.eyebrow, 'eyebrow', 'eyebrow', layout.eyebrow || [72, 180, family.width - 144, 44, 21]), semanticText(texts.headline, 'headline', 'headline', layout.headline), semanticText(texts.body, 'body', 'body', layout.body), semanticText(texts.cta, 'cta', 'cta', layout.cta || [72, family.height - 145, family.width - 144, 58, 24]))
  return { id, name, role, background: source.background, nodes }
}

function layoutsFor(family: GlobalDesignFamily, cover: DesignVariant, content: DesignVariant) {
  const W = family.width, H = family.height
  const image = [cover, content].some(variant => variant.nodes.some(node => node.src === '{{image.primary}}'))
  const decorationCount = [cover, content].flatMap(variant => variant.nodes).filter(node => node.type === 'shape' || node.type === 'gradient').length
  const kind = image ? 'photo' : decorationCount > 40 ? 'pattern' : 'editorial'
  const coverNative = layoutFromSource(cover, family, 'cover'), contentNative = layoutFromSource(content, family, 'content')
  if (kind === 'photo') return { kind, covers: [coverNative, { ...coverNative, decor: 'mirror', headline: [.50 * W, .22 * H, .40 * W, .34 * H, 96, 'right'] }, { ...coverNative, decor: 'inset', headline: [.14 * W, .31 * H, .72 * W, .25 * H, 92, 'center'], body: [.20 * W, .62 * H, .60 * W, .14 * H, 29, 'center'] }], contents: [contentNative,
    { ...contentNative, decor: 'mirror', headline: [.53 * W, .20 * H, .37 * W, .25 * H, 78, 'right'], body: [.10 * W, .51 * H, .52 * W, .28 * H, 30] },
    { ...contentNative, decor: 'left-photo', headline: [.55 * W, .18 * H, .37 * W, .25 * H, 72], body: [.55 * W, .49 * H, .37 * W, .32 * H, 29] },
    { ...contentNative, decor: 'right-photo', headline: [.08 * W, .19 * H, .36 * W, .28 * H, 76], body: [.08 * W, .51 * H, .36 * W, .29 * H, 29] },
    { ...contentNative, decor: 'top-photo', headline: [.08 * W, .56 * H, .84 * W, .16 * H, 72], body: [.08 * W, .75 * H, .70 * W, .15 * H, 28] },
    { ...contentNative, decor: 'bottom-photo', headline: [.08 * W, .15 * H, .84 * W, .20 * H, 80], body: [.08 * W, .37 * H, .68 * W, .12 * H, 28] },
    { ...contentNative, decor: 'inset', headline: [.14 * W, .18 * H, .72 * W, .24 * H, 82, 'center'], body: [.18 * W, .68 * H, .64 * W, .18 * H, 28, 'center'] },
    { ...contentNative, decor: 'native', headline: [.09 * W, .18 * H, .46 * W, .34 * H, 88], body: [.58 * W, .25 * H, .33 * W, .30 * H, 27, 'right'] },
    { ...contentNative, decor: 'mirror', headline: [.12 * W, .60 * H, .76 * W, .18 * H, 74, 'center'], body: [.18 * W, .80 * H, .64 * W, .10 * H, 27, 'center'] },
    { ...contentNative, decor: 'inset', headline: [.18 * W, .29 * H, .64 * W, .26 * H, 86, 'center'], body: [.23 * W, .59 * H, .54 * W, .18 * H, 29, 'center'] }] }
  if (kind === 'pattern') return { kind, covers: [coverNative, { ...coverNative, decor: 'mirror', headline: [.12 * W, .27 * H, .76 * W, .34 * H, 112, 'right'] }, { ...coverNative, decor: 'fall', headline: [.16 * W, .30 * H, .68 * W, .30 * H, 106, 'center'] }], contents: [contentNative,
    { ...contentNative, decor: 'mirror', headline: [.12 * W, .23 * H, .74 * W, .25 * H, 94, 'right'], body: [.20 * W, .60 * H, .60 * W, .24 * H, 33] },
    { ...contentNative, decor: 'rise', headline: [.09 * W, .18 * H, .52 * W, .30 * H, 92], body: [.55 * W, .56 * H, .36 * W, .28 * H, 31, 'right'] },
    { ...contentNative, decor: 'fall', headline: [.38 * W, .18 * H, .53 * W, .30 * H, 92, 'right'], body: [.09 * W, .58 * H, .58 * W, .25 * H, 32] },
    { ...contentNative, decor: 'inset', headline: [.15 * W, .25 * H, .70 * W, .24 * H, 90, 'center'], body: [.18 * W, .58 * H, .64 * W, .25 * H, 32, 'center'] },
    { ...contentNative, decor: 'native', headline: [.08 * W, .20 * H, .84 * W, .18 * H, 84], body: [.08 * W, .48 * H, .84 * W, .33 * H, 34] },
    { ...contentNative, decor: 'mirror', headline: [.08 * W, .50 * H, .84 * W, .23 * H, 94, 'center'], body: [.16 * W, .76 * H, .68 * W, .15 * H, 30, 'center'] },
    { ...contentNative, decor: 'rise', headline: [.10 * W, .24 * H, .36 * W, .40 * H, 82], body: [.52 * W, .31 * H, .38 * W, .36 * H, 31] },
    { ...contentNative, decor: 'fall', headline: [.52 * W, .23 * H, .38 * W, .38 * H, 82, 'right'], body: [.10 * W, .35 * H, .34 * W, .32 * H, 31] },
    { ...contentNative, decor: 'inset', headline: [.20 * W, .22 * H, .60 * W, .28 * H, 98, 'center'], body: [.24 * W, .56 * H, .52 * W, .23 * H, 31, 'center'] }] }
  return { kind, covers: [coverNative, { ...coverNative, decor: 'mirror', accent: 'marker', headline: [.11 * W, .24 * H, .78 * W, .42 * H, 112, 'right'] }, { ...coverNative, decor: 'inset', accent: 'frame', headline: [.15 * W, .28 * H, .70 * W, .36 * H, 104, 'center'] }], contents: [contentNative,
    { ...contentNative, decor: 'mirror', accent: 'marker', headline: [.35 * W, .22 * H, .55 * W, .24 * H, 88, 'right'], body: [.10 * W, .55 * H, .67 * W, .28 * H, 34] },
    { ...contentNative, decor: 'native', accent: 'band', headline: [.10 * W, .18 * H, .80 * W, .19 * H, 84], body: [.10 * W, .49 * H, .80 * W, .32 * H, 35] },
    { ...contentNative, decor: 'inset', accent: 'frame', headline: [.15 * W, .23 * H, .70 * W, .25 * H, 88, 'center'], body: [.18 * W, .58 * H, .64 * W, .24 * H, 33, 'center'] },
    { ...contentNative, decor: 'rise', accent: 'column', headline: [.10 * W, .22 * H, .43 * W, .32 * H, 82], body: [.58 * W, .31 * H, .32 * W, .37 * H, 31] },
    { ...contentNative, decor: 'fall', accent: 'marker', headline: [.50 * W, .19 * H, .40 * W, .35 * H, 82, 'right'], body: [.10 * W, .54 * H, .48 * W, .30 * H, 32] },
    { ...contentNative, decor: 'native', accent: 'frame', headline: [.10 * W, .34 * H, .80 * W, .25 * H, 94, 'center'], body: [.18 * W, .65 * H, .64 * W, .20 * H, 32, 'center'] },
    { ...contentNative, decor: 'mirror', accent: 'band', headline: [.08 * W, .17 * H, .84 * W, .34 * H, 102], body: [.34 * W, .60 * H, .56 * W, .25 * H, 32, 'right'] },
    { ...contentNative, decor: 'inset', accent: 'column', headline: [.20 * W, .18 * H, .60 * W, .28 * H, 94, 'center'], body: [.20 * W, .55 * H, .60 * W, .27 * H, 33, 'center'] },
    { ...contentNative, decor: 'native', accent: 'marker', headline: [.10 * W, .19 * H, .58 * W, .28 * H, 88], body: [.10 * W, .56 * H, .80 * W, .27 * H, 34] }] }
}

/** Build a family-specific set from its reconstructed cover and content references. */
export function ensureFamilyVariations(input: GlobalDesignFamily): GlobalDesignFamily {
  const family = refineReferenceFamily(input)
  const existingCovers = family.variants.filter(variant => variant.role === 'cover'), existingContents = family.variants.filter(variant => variant.role !== 'cover')
  const oldGeneric = family.variants.some(variant => variant.name === 'Reference hero') && family.variants.some(variant => variant.name === 'Asymmetric split')
  if (!oldGeneric && existingCovers.length >= 3 && existingContents.length >= 10) return family
  const cover = existingCovers.find(variant => variant.id === 'cover') || existingCovers[0] || family.variants[0]
  const content = family.variants.find(variant => variant.id === 'content') || family.variants.find(variant => variant.role === 'content') || existingContents[0] || cover
  const W = family.width, H = family.height
  const fallbackHeadline: TemplateNode = { id: 'headline-source', type: 'text', text: '{{headline}}', x: 90, y: 280, width: W - 180, height: 330, fontFamily: 'brand.headingFont', fontSize: 92, minFontSize: 40, fontWeight: 700, lineHeight: 1.04, color: 'brand.textPrimary' }
  const fallbackBody: TemplateNode = { id: 'body-source', type: 'text', text: '{{body}}', x: 90, y: 670, width: W - 180, height: 330, fontFamily: 'brand.bodyFont', fontSize: 34, minFontSize: 18, fontWeight: 400, lineHeight: 1.24, color: 'brand.textPrimary', optional: true }
  const all = [cover, content], texts = { headline: sourceForSlot(all, 'headline', fallbackHeadline), body: sourceForSlot(all, 'body', fallbackBody), eyebrow: sourceForSlot(all, 'eyebrow', { ...fallbackBody, id: 'eyebrow-source', text: '{{eyebrow}}', height: 48, fontSize: 22 }), cta: sourceForSlot(all, 'cta', { ...fallbackBody, id: 'cta-source', text: '{{cta}}', y: H - 145, height: 58, fontSize: 24 }) }
  const layouts = layoutsFor(family, cover, content)
  const coverVariants = layouts.covers.map((layout, index) => createVariant(family, index === 2 ? content : cover, texts, `cover-${index + 1}`, `${cover.name} · ${['reference', 'alternate', 'campaign'][index]}`, 'cover', layout))
  const roles: DesignVariant['role'][] = ['content', 'content', 'list', 'content', 'image-content', 'list', 'quote', 'content', 'image-content', 'cta']
  const labels = layouts.kind === 'photo' ? ['reference reading', 'reverse story', 'photo left', 'photo right', 'photo above', 'photo below', 'framed photograph', 'editorial overlay', 'closing photograph', 'focused invitation'] : layouts.kind === 'pattern' ? ['reference rhythm', 'reversed field', 'rising pattern', 'falling pattern', 'framed motif', 'wide explanation', 'centered milestone', 'two-column sequence', 'reverse sequence', 'focused invitation'] : ['reference editorial', 'reverse editorial', 'open statement', 'centered note', 'asymmetric note', 'counterpoint', 'centered quote', 'large statement', 'framed explanation', 'focused invitation']
  const contentVariants = layouts.contents.map((layout, index) => createVariant(family, index === 1 ? cover : content, texts, `content-${index + 1}`, `${content.name} · ${labels[index]}`, roles[index], layout))
  return { ...family, variants: [...coverVariants, ...contentVariants] }
}
