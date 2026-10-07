import sharp from 'sharp'

/**
 * Layout facts measured from a reference's pixels, in code. Vision models misread exactly these (centred copy read as
 * left-aligned, an outlined box read as a "thin rule"), so they correct the study after the model call.
 * Everything is relative to the image (0–1), measured on a 540px-wide copy.
 */
export interface ReferenceMetrics {
  /** Alignment of the copy lines, when enough lines agree. */
  align: 'left' | 'center' | 'right' | null
  /** A rectangle outlined in a saturated colour that encloses text. */
  box: { x: number; y: number; width: number; height: number } | null
  /** Long thin saturated lines that are not part of a box (separators, accents). */
  rules: number
  /** Some copy is set in a saturated (accent) colour. */
  coloredText: boolean
  lines: { left: number; right: number; top: number; bottom: number }[]
}

const WIDTH = 540

export async function measureReference(bytes: Buffer): Promise<ReferenceMetrics> {
  const { data, info } = await sharp(bytes).rotate().resize({ width: WIDTH }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const W = info.width, H = info.height, count = W * H
  const lum = new Float32Array(count), sat = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2]
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    lum[i] = (r * .299 + g * .587 + b * .114) / 255
    sat[i] = max ? (max - min) / max : 0
  }
  // Local contrast against a wide box blur: text strokes stand out sharply from what surrounds them.
  const blur = boxBlur(lum, W, H, 9)
  const edge = new Uint8Array(count)
  for (let i = 0; i < count; i++) edge[i] = Math.abs(lum[i] - blur[i]) > .2 ? 1 : 0
  const accent = new Uint8Array(count)
  for (let i = 0; i < count; i++) accent[i] = sat[i] > .4 && lum[i] > .18 && lum[i] < .95 ? 1 : 0

  // Saturated horizontal segments: thin ones are rules or box edges.
  const segments: { y0: number; y1: number; x0: number; x1: number }[] = []
  for (let y = 0; y < H; y++) {
    let start = -1, gap = 0
    for (let x = 0; x <= W; x++) {
      const on = x < W && accent[y * W + x]
      if (on) { if (start < 0) start = x; gap = 0 }
      else if (start >= 0 && ++gap > 3) {
        const end = x - gap
        if (end - start >= W * .28) {
          const open = segments.find(s => y - s.y1 <= 1 && Math.abs(s.x0 - start) < W * .03 && Math.abs(s.x1 - end) < W * .03)
          if (open) { open.y1 = y; open.x0 = Math.min(open.x0, start); open.x1 = Math.max(open.x1, end) } else segments.push({ y0: y, y1: y, x0: start, x1: end })
        }
        start = -1; gap = 0
      }
    }
  }
  // A rule or box edge is a thin stroke with no colour just above or below it, not the edge of a coloured area (sky).
  const densityAt = (y: number, x0: number, x1: number) => { if (y < 0 || y >= H) return 0; let on = 0; for (let x = x0; x <= x1; x++) on += accent[y * W + x]; return on / (x1 - x0 + 1) }
  const thin = segments.filter(s => s.y1 - s.y0 <= H * .012 && densityAt(s.y0 - 4, s.x0, s.x1) < .25 && densityAt(s.y1 + 4, s.x0, s.x1) < .25)
  // Two thin segments of the same span joined by saturated verticals at both ends form an outlined box.
  let box: ReferenceMetrics['box'] = null
  const paired = new Set<any>()
  for (const top of thin) for (const bottom of thin) {
    if (bottom === top || bottom.y0 - top.y1 < H * .03 || bottom.y0 - top.y1 > H * .3) continue
    if (Math.abs(top.x0 - bottom.x0) > W * .03 || Math.abs(top.x1 - bottom.x1) > W * .03) continue
    const side = (x0: number) => { let hits = 0; for (let y = top.y1; y <= bottom.y0; y++) { let on = 0; for (let x = Math.max(0, x0 - 3); x <= Math.min(W - 1, x0 + 3); x++) on |= accent[y * W + x]; hits += on } return hits / (bottom.y0 - top.y1 + 1) }
    if (side(top.x0) < .7 || side(top.x1) < .7) continue
    // It must enclose copy: the interior carries dense contrast (lettering), not empty space or more colour.
    let strokes = 0, area = 0
    for (let y = top.y1 + 3; y < bottom.y0 - 2; y++) for (let x = top.x0 + 6; x < top.x1 - 6; x++) { area++; strokes += edge[y * W + x] }
    if (!area || strokes / area < .04) continue
    box = { x: top.x0 / W, y: top.y0 / H, width: (top.x1 - top.x0) / W, height: (bottom.y1 - top.y0) / H }
    paired.add(top); paired.add(bottom)
  }
  const rules = thin.filter(s => !paired.has(s)).length

  // Copy lines: bands of rows with dense, compact contrast. Full-width texture (photos) and the box edges are ignored.
  const rowSpan = (y: number) => {
    const xs: number[] = []
    for (let x = 0; x < W; x++) if (edge[y * W + x] && !inBoxEdge(x / W, y / H)) xs.push(x)
    if (xs.length < W * .025) return null
    // Keep the densest run of edge pixels (words are joined across gaps up to ~4% of the width).
    let best: [number, number, number] | null = null, s = xs[0], prev = xs[0], n = 1
    for (let i = 1; i <= xs.length; i++) {
      if (i < xs.length && xs[i] - prev <= W * .04) { prev = xs[i]; n++; continue }
      if (!best || n > best[2]) best = [s, prev, n]
      if (i < xs.length) { s = xs[i]; prev = xs[i]; n = 1 }
    }
    return best && best[2] >= W * .02 ? { left: best[0], right: best[1] } : null
  }
  function inBoxEdge(x: number, y: number) {
    if (!box) return false
    const near = (a: number, b: number) => Math.abs(a - b) < .015
    return (near(x, box.x) || near(x, box.x + box.width)) && y >= box.y && y <= box.y + box.height || (near(y, box.y) || near(y, box.y + box.height)) && x >= box.x && x <= box.x + box.width
  }
  const lines: ReferenceMetrics['lines'] = []
  let band: { y0: number; y1: number; lefts: number[]; rights: number[] } | null = null
  for (let y = 0; y <= H; y++) {
    const span = y < H ? rowSpan(y) : null
    if (span) { band ||= { y0: y, y1: y, lefts: [], rights: [] }; band.y1 = y; band.lefts.push(span.left); band.rights.push(span.right); continue }
    if (band) {
      const height = band.y1 - band.y0 + 1
      const left = median(band.lefts), right = median(band.rights)
      // A copy line is a short band that keeps clear of both canvas edges and of the branding rows (logo, handle).
      if (height >= H * .012 && height <= H * .12 && right - left >= W * .1 && left > W * .03 && right < W * .97 && band.y0 > H * .09 && band.y1 < H * .95) lines.push({ left: left / W, right: right / W, top: band.y0 / H, bottom: band.y1 / H })
      band = null
    }
  }

  // Alignment from lines narrower than the copy area: centred lines share a midpoint, left lines a left edge.
  const informative = lines.filter(l => l.right - l.left < .8)
  let align: ReferenceMetrics['align'] = null
  if (informative.length >= 2) {
    const minLeft = Math.min(...informative.map(l => l.left)), maxRight = Math.max(...informative.map(l => l.right))
    const votes = { left: 0, center: 0, right: 0 }
    for (const l of informative) {
      const mid = (l.left + l.right) / 2
      if (Math.abs(mid - .5) < .035) votes.center++
      else if (Math.abs(l.left - minLeft) < .025) votes.left++
      else if (Math.abs(l.right - maxRight) < .025) votes.right++
    }
    const winner = (Object.entries(votes) as [keyof typeof votes, number][]).sort((a, b) => b[1] - a[1])[0]
    if (winner[1] >= 2 && winner[1] >= informative.length * .5) align = winner[0]
  }

  // Coloured copy: saturated pixels make up a real share of a line's strokes (box edges excluded).
  const coloredText = lines.some(l => {
    let strokes = 0, colored = 0
    for (let y = Math.round(l.top * H); y <= Math.round(l.bottom * H); y++) for (let x = Math.round(l.left * W); x <= Math.round(l.right * W); x++) {
      const i = y * W + x
      if (!edge[i] || inBoxEdge(x / W, y / H)) continue
      strokes++; if (accent[i]) colored++
    }
    return strokes > 40 && colored / strokes > .25
  })
  return { align, box, rules, coloredText, lines }
}

function median(values: number[]) { const s = [...values].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] }

function boxBlur(src: Float32Array, W: number, H: number, r: number) {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length)
  for (let y = 0; y < H; y++) { let sum = 0; for (let x = -r; x <= r; x++) sum += src[y * W + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[y * W + x] = sum / (2 * r + 1); sum += src[y * W + Math.min(W - 1, x + r + 1)] - src[y * W + Math.max(0, x - r)] } }
  for (let x = 0; x < W; x++) { let sum = 0; for (let y = -r; y <= r; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { out[y * W + x] = sum / (2 * r + 1); sum += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x] } }
  return out
}

const LEFT_RULE = /left[- ]aligned|align(?:ed)? (?:to the )?left|alinhad[oa]s? à esquerda/i
const CENTRE_RULE = /cent(?:er|re)(?:d|ing)?\b|centrad[oa]/i

/**
 * Corrects a model-written study with what the reference pixels show. Only facts measured with confidence change:
 * alignment when the measured references agree, a headline box per reference that has one, emphasis colour when no
 * reference sets copy in colour, and accent lines that were really a box's edges. Contradicting prose is dropped.
 */
export function applyReferenceMetrics(study: any, metrics: ReferenceMetrics[]) {
  if (!study?.grammar || !metrics.length) return study
  const grammar = { ...study.grammar }, rules = { familyRules: [...(study.familyRules || [])], variantRules: [...(study.variantRules || [])], avoid: [...(study.avoid || [])] }
  let prose = { composition: study.composition || '', typography: study.typography || '', hierarchy: study.hierarchy || '', decorative: study.decorative || '' }
  const references = (grammar.references || []).map((r: any, i: number) => metrics[i] ? { ...r, ...(metrics[i].align ? { align: metrics[i].align } : {}), frame: !!metrics[i].box } : r)
  grammar.references = references

  const measured = metrics.map(m => m.align).filter(Boolean) as string[]
  const align = measured.length && measured.every(a => a === measured[0]) ? measured[0] : null
  if (align) {
    grammar.alignment = [align]
    // References that could not be measured follow the ones that agree.
    grammar.references = grammar.references.map((r: any, i: number) => metrics[i]?.align ? r : { ...r, align })
    const contradicts = align === 'center' ? LEFT_RULE : CENTRE_RULE
    rules.familyRules = rules.familyRules.filter((r: string) => !contradicts.test(r))
    rules.variantRules = rules.variantRules.filter((r: string) => !contradicts.test(r))
    // An anti-pattern that forbids the measured alignment is wrong too.
    rules.avoid = rules.avoid.filter((r: string) => !(align === 'center' ? CENTRE_RULE : LEFT_RULE).test(r))
    if (align === 'center') {
      prose = Object.fromEntries(Object.entries(prose).map(([k, v]) => [k, v.replace(/left[- ]aligned/gi, 'centred')])) as typeof prose
      if (!rules.familyRules.some((r: string) => CENTRE_RULE.test(r))) rules.familyRules.push('Copy is centred on the canvas.')
    }
  }
  if (metrics.some(m => m.box)) {
    grammar.headline = { ...grammar.headline, frame: grammar.headline?.frame === 'solid' ? 'solid' : 'outline' }
    if (!rules.familyRules.some((r: string) => /box|frame|border/i.test(r))) rules.familyRules.push('The key headline sits inside a thin outlined box in the accent colour.')
  }
  if (!metrics.some(m => m.coloredText) && (grammar.emphasis === 'color' || grammar.emphasis === 'background')) grammar.emphasis = 'none'
  // A "thin rule" with no measured rule was a box's edges.
  if (!metrics.some(m => m.rules) && Array.isArray(grammar.decorations)) grammar.decorations = grammar.decorations.filter((d: any) => d?.kind !== 'line')
  return { ...study, ...prose, ...rules, grammar }
}
