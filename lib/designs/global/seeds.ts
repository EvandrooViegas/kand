import type { GlobalDesignFamily, TemplateNode, DesignVariant } from './types'

const text = (id: string, slot: string, x: number, y: number, width: number, height: number, fontSize: number, options: Partial<TemplateNode> = {}): TemplateNode => ({ id, type: 'text', text: `{{${slot}}}`, x, y, width, height, fontSize, minFontSize: Math.max(22, Math.round(fontSize * .58)), fontFamily: 'brand.headingFont', fontWeight: 700, lineHeight: 1.04, color: 'brand.textPrimary', ...options })
const rect = (id: string, x: number, y: number, width: number, height: number, options: Partial<TemplateNode> = {}): TemplateNode => ({ id, type: 'shape', shape: 'rect', x, y, width, height, fill: 'brand.accent', ...options })
const ref = (n: number) => ({ id: `reference-${n}`, name: `${n}.png`, url: `/design-references/${n}.png`, width: 1080, height: 1350 })
const body = { fontFamily: 'brand.bodyFont', fontWeight: 400, lineHeight: 1.15 } as const
const quietHeader = () => [text('brand-name', 'brand.name', 108, 110, 540, 46, 28, { ...body }), text('number', 'number', 848, 108, 124, 50, 30, { color: 'brand.accent', textAlign: 'right' })]
const quietFooter = () => [text('website', 'brand.website', 108, 1200, 650, 48, 28, { ...body, fontStyle: 'italic', optional: true }), text('cta', 'cta', 798, 1198, 174, 62, 28, { textAlign: 'right', fontStyle: 'italic', optional: true })]
const logo = (color: TemplateNode['color'] = 'brand.textPrimary') => [text('brand-name', 'brand.name', 116, 104, 270, 72, 30, { color }), { id: 'brand-logo', type: 'image', x: 116, y: 104, width: 160, height: 72, src: '{{brand.logo}}', objectFit: 'contain', optional: true } as TemplateNode]

// A field of individual editable diamonds, with the reference's changing density.
function diamonds(reverse = false): TemplateNode[] {
  const nodes: TemplateNode[] = []
  for (let row = 0; row < 35; row++) for (let col = 0; col < 28; col++) {
    const t = row / 34, size = 3 + 14 * (reverse ? t : 1 - t)
    nodes.push(rect(`diamond-${row}-${col}`, col * 39 + (row % 2 ? 19 : 0) - size / 2, row * 39 - size / 2, size, size, { fill: 'brand.secondary', rotation: 45, fillAlpha: 18 } as Partial<TemplateNode>))
  }
  return nodes
}
const timelineHeader = () => [
  rect('header-outline', 110, 110, 344, 78, { fill: 'transparent', stroke: 'brand.onPrimary', strokeWidth: 4, borderRadius: 42 }),
  text('eyebrow', 'eyebrow', 138, 126, 288, 48, 38, { ...body, color: 'brand.onPrimary', textAlign: 'center', optional: true }),
  text('number', 'number', 820, 120, 150, 118, 114, { color: 'brand.onPrimary', textAlign: 'right' }),
]
function timeline(): TemplateNode[] {
  return [rect('timeline', 170, 1067, 740, 11, { fill: 'brand.textPrimary' }), ...[172, 418, 664, 910].flatMap((x, i) => [
    rect(`milestone-${i}`, x - 34, 1038, 68, 68, { shape: 'ellipse', fill: i === 0 || i === 3 ? 'brand.onPrimary' : 'brand.primary', stroke: 'brand.textPrimary', strokeWidth: 11 }),
    text(`step-${i}`, `step.${i + 1}`, x - 112, 1140, 224, 80, 33, { ...body, textAlign: 'center', optional: true }),
  ])]
}
const connectors = () => [rect('left-line', -15, 680, 134, 10, { fill: 'brand.textPrimary' }), rect('left-ring', 86, 650, 68, 68, { shape: 'ellipse', fill: 'brand.primary', stroke: 'brand.textPrimary', strokeWidth: 11 }), rect('right-line', 824, 1038, 270, 10, { fill: 'brand.textPrimary' }), rect('right-ring', 789, 1008, 68, 68, { shape: 'ellipse', fill: 'brand.primary', stroke: 'brand.textPrimary', strokeWidth: 11 })]
const orangeCover: DesignVariant = { id: 'cover', name: 'Timeline cover', role: 'cover', background: 'brand.primary', nodes: [...diamonds(), ...timelineHeader(), text('headline', 'headline', 108, 420, 864, 470, 148, { textTransform: 'uppercase', highlight: 'color', letterSpacing: -5 }), ...timeline()] }
const orangeContent: DesignVariant = { id: 'content', name: 'Connected explanation', role: 'content', background: 'brand.primary', nodes: [...diamonds(true), ...timelineHeader(), text('headline', 'headline', 184, 362, 788, 380, 122, { textTransform: 'uppercase', highlight: 'color', letterSpacing: -4 }), text('body', 'body', 237, 844, 586, 330, 40, { ...body, optional: true }), ...connectors()] }

// The curved dashed arrow is reconstructed as editable rotated line segments.
function arrow(): TemplateNode[] {
  const nodes: TemplateNode[] = []
  const points = [[867,711],[889,699],[891,675],[876,655],[849,649],[822,655],[811,675],[828,688],[854,679],[870,657],[873,631],[864,606],[844,585],[819,568],[786,551]]
  for (let i = 1; i < points.length; i++) {
    const [x, y] = points[i - 1], [x2, y2] = points[i], length = Math.hypot(x2 - x, y2 - y)
    nodes.push(rect(`arrow-dash-${i}`, (x + x2) / 2 - length * .3, (y + y2) / 2, length * .6, 3, { fill: 'brand.textPrimary', borderRadius: 2, rotation: Math.atan2(y2 - y, x2 - x) * 180 / Math.PI }))
  }
  nodes.push(rect('arrowhead-a', 779, 548, 22, 7, { fill: 'brand.textPrimary', rotation: -15 }), rect('arrowhead-b', 779, 548, 22, 7, { fill: 'brand.textPrimary', rotation: 60 }))
  return nodes
}
const yellowCover: DesignVariant = { id: 'cover', name: 'Highlighted statement', role: 'cover', background: 'brand.background', nodes: [...quietHeader(), text('headline', 'headline', 108, 345, 864, 665, 148, { lineHeight: 1.12, highlight: 'background', highlightCount: 2, letterSpacing: -3 }), ...quietFooter()] }
const yellowContent: DesignVariant = { id: 'content', name: 'Open editorial', role: 'content', background: 'brand.background', nodes: [...quietHeader(), text('headline', 'headline', 130, 350, 680, 255, 116, { highlight: 'background' }), ...arrow(), text('body', 'body', 130, 712, 760, 305, 50, { ...body, highlight: 'color', optional: true }), ...quietFooter()] }
const photoBase = (): TemplateNode[] => [
  { id: 'photo', type: 'image', x: 0, y: 0, width: 1080, height: 1350, src: '{{image.primary}}', objectFit: 'cover' },
  { id: 'shade', type: 'gradient', x: 0, y: 0, width: 1080, height: 1350, gradientType: 'linear', angle: 90, stops: [{ color: 'brand.overlay', position: 0, alpha: 76 }, { color: 'brand.overlay', position: 100, alpha: 18 }] },
  ...logo('brand.onImage'),
]
const photoCover: DesignVariant = { id: 'cover', name: 'Full-bleed serif cover', role: 'cover', background: 'brand.overlay', nodes: [...photoBase(), text('headline', 'headline', 108, 312, 820, 348, 170, { fontWeight: 400, color: 'brand.onImage', letterSpacing: -5, lineHeight: 1.03 }), text('body', 'body', 126, 695, 780, 100, 34, { fontStyle: 'italic', color: 'brand.onImage', optional: true }), text('author', 'author', 116, 1160, 650, 90, 34, { color: 'brand.onImage', optional: true })] }
const photoContent: DesignVariant = { id: 'content', name: 'Photo with two-column reading', role: 'content', background: 'brand.overlay', nodes: [...photoBase().map(n => n.id === 'shade' ? { ...n, angle: 180, stops: [{ color: 'brand.overlay' as const, position: 0, alpha: 80 }, { color: 'brand.overlay' as const, position: 100, alpha: 8 }] } : n), text('eyebrow', 'eyebrow', 800, 106, 172, 90, 30, { fontStyle: 'italic', color: 'brand.onImage', textAlign: 'right', optional: true }), text('headline', 'headline', 108, 300, 430, 230, 102, { fontWeight: 400, color: 'brand.onImage' }), text('body', 'body', 602, 324, 370, 286, 28, { ...body, fontFamily: 'brand.headingFont', color: 'brand.onImage', textAlign: 'right', optional: true })] }

function variants(cover: DesignVariant, content: DesignVariant): DesignVariant[] {
  // Optional copy fits in reserved whitespace; reference covers may omit it.
  if (!cover.nodes.some(n => n.text?.includes('{{body}}'))) cover = { ...cover, nodes: [...cover.nodes, text('body', 'body', 110, cover.background === 'brand.primary' ? 926 : 1050, 850, 86, 30, { ...body, optional: true })] }
  if (!content.nodes.some(n => n.text?.includes('{{cta}}'))) content = { ...content, nodes: [...content.nodes, text('cta', 'cta', 110, 1230, 860, 66, 26, { ...body, color: content.background === 'brand.overlay' ? 'brand.onImage' : 'brand.textPrimary', optional: true })] }
  return [cover, content,
    { ...content, id: 'list', role: 'list', name: 'Steps', nodes: content.nodes.map(n => n.id === 'body' ? { ...n, fontSize: Math.min(n.fontSize || 40, 38) } : n) },
    { ...content, id: 'cta', role: 'cta', name: 'Closing invitation', nodes: content.nodes.map(n => n.id === 'body' ? { ...n, text: '{{body}}\n{{cta}}' } : n.id === 'cta' ? { ...n, text: '{{brand.website}}' } : n) },
  ]
}
export const INITIAL_GLOBAL_FAMILIES: GlobalDesignFamily[] = [
  { schemaVersion: 1, version: 2, id: 'momentum-timeline', name: 'Momentum Timeline', description: 'Oversized condensed hierarchy, a fading diamond field, outlined pill and numbered header, connected milestone motifs.', tags: ['bold', 'steps', 'typographic'], width: 1080, height: 1350, typography: { headingFallback: 'Inter', bodyFallback: 'Inter' }, referenceImages: [ref(1), ref(2)], analysis: 'References 1 and 2 share 108px outer margins, a 344×78 outlined header at (110,110), upper-right large number, dense uppercase headings and editable diamond texture. Cover: title begins at (108,420), four-node timeline at y1072. Content: title inset to x184 and body x237/y844, edge-connected rings. Density reverses between cover and content. Original orange, navy and white become semantic primary/text/onPrimary roles.', variants: variants(orangeCover, orangeContent) },
  { schemaVersion: 1, version: 2, id: 'highlight-editorial', name: 'Highlight Editorial', description: 'Generous white space, oversized sans-serif type, selective marker highlights and a small dashed annotation.', tags: ['minimal', 'education', 'editorial'], width: 1080, height: 1350, typography: { headingFallback: 'Inter', bodyFallback: 'Inter' }, referenceImages: [ref(3), ref(4)], analysis: 'References 3 and 4 share a 108px frame, discreet brand at upper left, accent counter upper right, footer website at y1200 and right-aligned CTA. Cover title occupies x108/y345/w864/h665. Content uses x130/y350 heading and x130/y712 body with a curved dashed arrow beside it. Yellow marker highlights become brand.accent; black and white become textPrimary/background. Text remains semantic and editable.', variants: variants(yellowCover, yellowContent) },
  { schemaVersion: 1, version: 2, id: 'serif-escape', name: 'Serif Escape', description: 'Full-bleed photography, directional dark overlays, large high-contrast serif typography and quiet corner branding.', tags: ['photography', 'serif', 'lifestyle'], width: 1080, height: 1350, typography: { headingFallback: 'Playfair Display', bodyFallback: 'Inter' }, referenceImages: [ref(5), ref(6)], analysis: 'References 5 and 6 are one photographic family. Photography fills 1080×1350 and remains a replaceable slot; no reference photo is embedded. Cover: brand x116/y104; serif headline x108/y312 with 170px type; italic supporting line y695; author lower left. Content: serif title at x108/y300, right-aligned body x602/y324/w370, tagline upper right. Left-to-right cover shading and top-to-bottom content shading preserve subject visibility.', variants: variants(photoCover, photoContent) },
]
