import fs from 'fs/promises'
import path from 'path'

// Per-font configuration. `local` fonts read from disk; CDN fonts use fontsource on jsdelivr.
const FONT_CONFIG = {
  'Inter': {
    local: true,
    weights: [400, 700],
    italic: false,
    files: {
      '400-normal': 'public/fonts/Inter-Regular.ttf',
      '700-normal': 'public/fonts/Inter-Bold.ttf',
    },
  },
  'Roboto': { cdn: 'roboto', weights: [300, 400, 500, 700, 900], italic: true },
  'Poppins': { cdn: 'poppins', weights: [300, 400, 500, 600, 700, 800, 900], italic: true },
  'Oswald': { cdn: 'oswald', weights: [300, 400, 500, 600, 700], italic: false },
  'Montserrat': { cdn: 'montserrat', weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Playfair Display': { cdn: 'playfair-display', weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Bebas Neue': { cdn: 'bebas-neue', weights: [400], italic: false },
  'Dancing Script': { cdn: 'dancing-script', weights: [400, 500, 600, 700], italic: false },
  'Pacifico': { cdn: 'pacifico', weights: [400], italic: false },
  'Lobster': { cdn: 'lobster', weights: [400], italic: false },
  'Raleway': { cdn: 'raleway', weights: [400, 500, 600, 700, 800, 900], italic: true },
  'Lato': { cdn: 'lato', weights: [300, 400, 700, 900], italic: true },
  'Open Sans': { cdn: 'open-sans', weights: [400, 500, 600, 700, 800], italic: true },
}

export const FONT_NAMES = Object.keys(FONT_CONFIG)
export function getFontMeta(name) { return FONT_CONFIG[name] || FONT_CONFIG['Inter'] }

const cache = new Map() // key -> Buffer

async function fetchToBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Font fetch failed ${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

function nearestWeight(weights, target) {
  let best = weights[0]
  let bestDiff = Math.abs(best - target)
  for (const w of weights) {
    const d = Math.abs(w - target)
    if (d < bestDiff) { best = w; bestDiff = d }
  }
  return best
}

async function loadFontVariant(family, weight, style) {
  const cfg = FONT_CONFIG[family] || FONT_CONFIG['Inter']
  const wantStyle = (style === 'italic' && cfg.italic) ? 'italic' : 'normal'
  const wantWeight = nearestWeight(cfg.weights, weight)
  const key = `${family}:${wantWeight}:${wantStyle}`
  if (cache.has(key)) return { buf: cache.get(key), weight: wantWeight, style: wantStyle }

  let buf
  if (cfg.local) {
    const fileKey = `${wantWeight}-${wantStyle}`
    const fpath = cfg.files[fileKey] || cfg.files[`${wantWeight}-normal`] || cfg.files['400-normal']
    buf = await fs.readFile(path.join(process.cwd(), fpath))
  } else {
    const url = `https://cdn.jsdelivr.net/npm/@fontsource/${cfg.cdn}/files/${cfg.cdn}-latin-${wantWeight}-${wantStyle}.woff`
    try {
      buf = await fetchToBuffer(url)
    } catch (e) {
      // fallback: normal style
      const fallback = `https://cdn.jsdelivr.net/npm/@fontsource/${cfg.cdn}/files/${cfg.cdn}-latin-${wantWeight}-normal.woff`
      buf = await fetchToBuffer(fallback)
    }
  }
  cache.set(key, buf)
  return { buf, weight: wantWeight, style: wantStyle }
}

export async function loadFontsForCanvas(canvas) {
  // Always include Inter regular + bold as a baseline fallback
  const wanted = new Map() // key -> {family, weight, style}
  const add = (family, weight, style) => {
    const k = `${family}:${weight}:${style}`
    if (!wanted.has(k)) wanted.set(k, { family, weight, style })
  }
  add('Inter', 400, 'normal'); add('Inter', 700, 'normal')

  for (const n of canvas.nodes || []) {
    if (n.type !== 'text') continue
    const family = FONT_CONFIG[n.fontFamily] ? n.fontFamily : 'Inter'
    const weight = n.fontWeight || 400
    const style = n.fontStyle === 'italic' ? 'italic' : 'normal'
    add(family, weight, style)
  }

  const fonts = []
  for (const { family, weight, style } of wanted.values()) {
    try {
      const v = await loadFontVariant(family, weight, style)
      fonts.push({ name: family, data: v.buf, weight: v.weight, style: v.style })
    } catch (e) {
      console.error('Font load failed', family, weight, style, e.message)
    }
  }
  return fonts
}
