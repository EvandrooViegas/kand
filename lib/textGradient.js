export const DEFAULT_TEXT_GRADIENT = {
  gradientType: 'linear', angle: 90, spread: 100, spreadMethod: 'pad',
  stops: [{ color: '#6366f1', position: 0, alpha: 100 }, { color: '#ec4899', position: 100, alpha: 100 }],
}

export function buildTextGradientCss(gradient = {}) {
  const finite = (v, fallback) => Number.isFinite(v) ? v : fallback
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v))
  const spread = clamp(finite(gradient.spread, 100), 1, 200)
  const source = gradient.stops?.length >= 2 ? gradient.stops : DEFAULT_TEXT_GRADIENT.stops
  const stops = source.map(s => {
    let hex = /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s.color) ? s.color.slice(1) : '000000'
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('')
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    return { color: `rgba(${rgb.join(',')},${clamp(finite(s.alpha, 100), 0, 100) / 100})`, position: clamp(finite(s.position, 0), 0, 100) }
  }).sort((a, b) => a.position - b.position)
  // Explicit cycles also work in the SVG export renderer.
  const expanded = []
  const repeating = ['repeat', 'reflect'].includes(gradient.spreadMethod)
  const cycles = repeating ? Math.ceil(100 / spread) : 1
  for (let cycle = 0; cycle < cycles; cycle++) {
    const reflected = gradient.spreadMethod === 'reflect' && cycle % 2 === 1
    const sequence = reflected ? [...stops].reverse() : stops
    for (const stop of sequence) expanded.push(`${stop.color} ${(cycle + (reflected ? 100 - stop.position : stop.position) / 100) * spread}%`)
  }
  const colors = expanded.join(', ')
  if (gradient.gradientType === 'radial') {
    return `radial-gradient(${gradient.radialShape === 'ellipse' ? 'ellipse' : 'circle'} at ${clamp(finite(gradient.focalX, 50), 0, 100)}% ${clamp(finite(gradient.focalY, 50), 0, 100)}%, ${colors})`
  }
  return `linear-gradient(${finite(gradient.angle, 90)}deg, ${colors})`
}

export function textGradientStyle(node, browser = true) {
  if (node.fillType !== 'gradient') return {}
  return {
    backgroundImage: buildTextGradientCss(node.textGradient), backgroundClip: 'text', color: 'transparent',
    ...(browser ? { WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', caretColor: node.color || '#000000' } : {}),
  }
}
