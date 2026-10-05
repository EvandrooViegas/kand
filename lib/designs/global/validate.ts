/**
 * Deterministic post checks. Corrections are applied in code; nothing here calls a model.
 * Text fitting itself happens while building (resolve.ts fitSize), which shrinks within readable limits.
 */
const SUPPORTED = new Set(['text', 'shape', 'image', 'gradient'])
const MIN_TEXT = 14

function luminance(hex: string) {
  if (!/^#[0-9a-f]{6}/i.test(hex)) return null
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
  return c[0] * .2126 + c[1] * .7152 + c[2] * .0722
}
const ratio = (a: number, b: number) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05)
const overlaps = (a: any, b: any) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

export interface ValidationReport { passed: boolean; corrections: string[]; warnings: string[]; errors: string[] }

export function validatePage(page: any, width: number, height: number, label = 'Post'): ValidationReport {
  const report: ValidationReport = { passed: true, corrections: [], warnings: [], errors: [] }
  const nodes: any[] = []
  for (const node of page.nodes || []) {
    if (!SUPPORTED.has(node.type)) { report.errors.push(`${label}: unsupported ${node.type} element`); continue }
    if (![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width <= 0 || node.height <= 0) { report.corrections.push(`${label}: removed an element with invalid geometry`); continue }
    if (node.type === 'image' && !node.src) { report.errors.push(`${label}: an image area has no image`); continue }
    if (node.type === 'text') {
      if (node.fontSize < MIN_TEXT) { node.fontSize = MIN_TEXT; report.corrections.push(`${label}: raised unreadable text to ${MIN_TEXT}px`) }
      // Small rounding drift outside the canvas is corrected; large overflow is a real layout error.
      const dx = Math.max(0, -node.x) - Math.max(0, node.x + node.width - width), dy = Math.max(0, -node.y) - Math.max(0, node.y + node.height - height)
      if (dx || dy) {
        if (Math.abs(dx) <= 24 && Math.abs(dy) <= 24) { node.x += dx; node.y += dy; report.corrections.push(`${label}: moved text back inside the canvas`) }
        else report.errors.push(`${label}: text overflows the canvas`)
      }
      // Solid page background is the only surface we can measure reliably.
      const fg = luminance(node.color), bg = luminance(page.background)
      const coveredByImage = (page.nodes || []).some((n: any) => (n.type === 'image' || n.type === 'gradient' || n.type === 'shape') && n !== node && overlaps(n, node))
      if (fg !== null && bg !== null && !coveredByImage && ratio(fg, bg) < 3) {
        node.color = bg > .179 ? '#101010' : '#ffffff'
        report.corrections.push(`${label}: increased text contrast`)
      }
    }
    nodes.push(node)
  }
  // Oversized background typography sits behind copy by design; only readable copy is checked for collisions.
  const texts = nodes.filter(n => n.type === 'text' && n.designRole !== 'backdrop-type')
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j]
    const ix = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), iy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)
    if (ix > 0 && iy > 0 && ix * iy > .25 * Math.min(a.width * a.height, b.width * b.height)) report.warnings.push(`${label}: two text blocks overlap`)
  }
  page.nodes = nodes
  report.passed = !report.errors.length
  return report
}

export function validatePost(canvas: any): ValidationReport {
  const pages = canvas.pages?.length ? canvas.pages : [canvas]
  const reports = pages.map((page: any, i: number) => validatePage(page, canvas.width, canvas.height, pages.length > 1 ? `Slide ${i + 1}` : 'Post'))
  if (!canvas.pages?.length) canvas.nodes = pages[0].nodes
  const merged = { passed: reports.every((r: ValidationReport) => r.passed), corrections: reports.flatMap((r: ValidationReport) => r.corrections), warnings: reports.flatMap((r: ValidationReport) => r.warnings), errors: reports.flatMap((r: ValidationReport) => r.errors) }
  return merged
}
