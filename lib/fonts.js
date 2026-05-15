import fs from 'fs/promises'
import path from 'path'

// Registry of supported fonts. _local means read from disk (relative to cwd).
// Other entries are remote URLs by weight.
const FONT_REGISTRY = {
  'Inter': {
    _local: true,
    400: 'public/fonts/Inter-Regular.ttf',
    700: 'public/fonts/Inter-Bold.ttf',
  },
  'Roboto': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/roboto/files/roboto-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/roboto/files/roboto-latin-700-normal.woff',
  },
  'Poppins': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/poppins/files/poppins-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/poppins/files/poppins-latin-700-normal.woff',
  },
  'Oswald': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/oswald/files/oswald-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/oswald/files/oswald-latin-700-normal.woff',
  },
  'Montserrat': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat/files/montserrat-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/montserrat/files/montserrat-latin-700-normal.woff',
  },
  'Playfair Display': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff',
  },
  'Bebas Neue': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff',
  },
  'Dancing Script': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/dancing-script/files/dancing-script-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/dancing-script/files/dancing-script-latin-700-normal.woff',
  },
  'Pacifico': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/pacifico/files/pacifico-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/pacifico/files/pacifico-latin-400-normal.woff',
  },
  'Lobster': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/lobster/files/lobster-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/lobster/files/lobster-latin-400-normal.woff',
  },
  'Raleway': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/raleway/files/raleway-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/raleway/files/raleway-latin-700-normal.woff',
  },
  'Lato': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/lato/files/lato-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/lato/files/lato-latin-700-normal.woff',
  },
  'Open Sans': {
    400: 'https://cdn.jsdelivr.net/npm/@fontsource/open-sans/files/open-sans-latin-400-normal.woff',
    700: 'https://cdn.jsdelivr.net/npm/@fontsource/open-sans/files/open-sans-latin-700-normal.woff',
  },
}

export const FONT_NAMES = Object.keys(FONT_REGISTRY)

const cache = new Map() // key: "family:weight" -> Buffer

async function fetchToBuffer(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Failed to fetch font ${url}: ${res.status}`)
  return Buffer.from(await res.arrayBuffer())
}

async function loadFontFor(family, weight) {
  const key = `${family}:${weight}`
  if (cache.has(key)) return cache.get(key)
  const reg = FONT_REGISTRY[family] || FONT_REGISTRY['Inter']
  const source = reg[weight] || reg[400] || Object.values(reg).find((v) => typeof v === 'string')
  if (!source) throw new Error(`No source for font ${family}:${weight}`)
  let buf
  if (reg._local) {
    buf = await fs.readFile(path.join(process.cwd(), source))
  } else {
    buf = await fetchToBuffer(source)
  }
  cache.set(key, buf)
  return buf
}

export async function loadFontsForCanvas(canvas) {
  // Always include Inter (default + fallback)
  const wanted = new Set(['Inter:400', 'Inter:700'])
  for (const n of canvas.nodes || []) {
    if (n.type === 'text') {
      const fam = n.fontFamily && FONT_REGISTRY[n.fontFamily] ? n.fontFamily : 'Inter'
      const w = n.fontWeight || 400
      wanted.add(`${fam}:${w}`)
    }
  }
  const fonts = []
  for (const key of wanted) {
    const [fam, w] = key.split(':')
    const weight = parseInt(w)
    try {
      const data = await loadFontFor(fam, weight)
      fonts.push({ name: fam, data, weight, style: 'normal' })
    } catch (e) {
      console.error('Font load failed', key, e.message)
    }
  }
  return fonts
}
