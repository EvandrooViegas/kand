import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { loadFontsForCanvas } from './fonts'

async function fetchImageBuffer(url) {
  if (!url) return null
  try {
    if (url.startsWith('data:')) {
      const m = url.match(/^data:[^;]+;base64,(.+)$/)
      if (!m) return null
      return Buffer.from(m[1], 'base64')
    }
    let finalUrl = url
    if (url.startsWith('/api/uploads/')) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || ''
      finalUrl = base + url
    }
    const res = await fetch(finalUrl, { redirect: 'follow' })
    if (!res.ok) return null
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.error('fetchImageBuffer error', url, e.message)
    return null
  }
}

async function applyImageFilters(buf, filters = {}) {
  const f = {
    brightness: 100, contrast: 100, saturate: 100, grayscale: 0,
    blur: 0, sepia: 0, hueRotate: 0, opacity: 100,
    ...filters,
  }
  const hasAny = f.brightness !== 100 || f.contrast !== 100 || f.saturate !== 100
    || f.grayscale > 0 || f.blur > 0 || f.sepia > 0 || f.hueRotate !== 0 || f.opacity !== 100
  if (!hasAny) return buf

  let p = sharp(buf, { failOn: 'none' }).ensureAlpha()
  if (f.brightness !== 100 || f.saturate !== 100 || f.hueRotate !== 0) {
    p = p.modulate({
      brightness: Math.max(0.01, f.brightness / 100),
      saturation: Math.max(0, f.saturate / 100),
      hue: f.hueRotate || 0,
    })
  }
  if (f.contrast !== 100) {
    const c = f.contrast / 100
    p = p.linear(c, 128 * (1 - c))
  }
  if (f.grayscale > 0) {
    if (f.grayscale >= 100) p = p.grayscale()
    else p = p.modulate({ saturation: Math.max(0, 1 - f.grayscale / 100) })
  }
  if (f.sepia > 0) {
    const intensity = f.sepia / 100
    p = p.modulate({ saturation: 1 - intensity * 0.7 }).tint({ r: 112 + 30 * intensity, g: 66 + 30 * intensity, b: 20 + 20 * intensity })
  }
  if (f.blur > 0) p = p.blur(Math.max(0.3, f.blur))
  if (f.opacity !== 100) {
    const alpha = Math.max(0, Math.min(1, f.opacity / 100))
    // Multiply alpha channel
    const raw = await p.png().toBuffer()
    const img = sharp(raw).ensureAlpha()
    const { data, info } = await img.raw().toBuffer({ resolveWithObject: true })
    for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * alpha)
    return await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  }
  return await p.png().toBuffer()
}

async function applyCanvasColorMode(buf, mode) {
  if (!mode || mode === 'color') return buf
  let p = sharp(buf)
  if (mode === 'grayscale') p = p.grayscale()
  else if (mode === 'sepia') p = p.modulate({ saturation: 0.3 }).tint({ r: 112, g: 66, b: 20 })
  else if (mode === 'invert') p = p.negate({ alpha: false })
  else if (mode === 'high-contrast') p = p.linear(1.6, -50)
  return await p.png().toBuffer()
}

function buildGradientCss(node) {
  const stops = (node.stops || [{ color: '#6366f1', position: 0, alpha: 100 }, { color: '#ec4899', position: 100, alpha: 100 }])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((s) => {
      const a = (typeof s.alpha === 'number' ? s.alpha : 100) / 100
      const hex = s.color || '#000000'
      const r = parseInt(hex.slice(1, 3), 16) || 0
      const g = parseInt(hex.slice(3, 5), 16) || 0
      const b = parseInt(hex.slice(5, 7), 16) || 0
      return `rgba(${r},${g},${b},${a}) ${s.position || 0}%`
    })
    .join(', ')
  if (node.gradientType === 'radial') return `radial-gradient(circle at center, ${stops})`
  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
}

function maskBorderRadius(node) {
  // mask preset overrides borderRadius for visual clipping
  const w = node.width, h = node.height
  switch (node.mask) {
    case 'circle': return Math.max(w, h)
    case 'pill': return Math.min(w, h) / 2
    case 'rounded': return Math.min(w, h) * 0.15
    case 'soft': return Math.min(w, h) * 0.08
    case 'square':
    case 'none':
    default: return node.borderRadius || 0
  }
}

export async function renderCanvasToPng(canvas, data = {}) {
  const fonts = await loadFontsForCanvas(canvas)
  const width = canvas.width || 1080
  const height = canvas.height || 1080
  const background = canvas.background || '#ffffff'

  const childPromises = (canvas.nodes || []).map(async (node) => {
    const dynVal = node.dynamic_key ? data[node.dynamic_key] : undefined

    if (node.type === 'text') {
      const text = dynVal !== undefined && dynVal !== null ? String(dynVal) : (node.text || '')
      const align = node.textAlign || 'left'
      const style = {
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
        color: node.color || '#000000',
        fontSize: node.fontSize || 48,
        fontWeight: node.fontWeight || 400,
        fontStyle: node.fontStyle === 'italic' ? 'italic' : 'normal',
        fontFamily: node.fontFamily || 'Inter',
        display: 'flex', alignItems: 'center',
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'pre-wrap',
      }
      if (node.textShadow && node.textShadow.enabled) {
        const ts = node.textShadow
        style.textShadow = `${ts.offsetX || 0}px ${ts.offsetY || 0}px ${ts.blur || 0}px ${ts.color || '#000'}`
      }
      return { type: 'div', props: { style, children: text } }
    }

    if (node.type === 'image') {
      let buf = await fetchImageBuffer(dynVal || node.src)
      if (buf && node.filters) {
        try { buf = await applyImageFilters(buf, node.filters) } catch (e) { console.error('filter error', e.message) }
      }
      const radius = maskBorderRadius(node)
      if (!buf) {
        return {
          type: 'div', props: {
            style: { position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height, background: '#e5e7eb', display: 'flex', borderRadius: radius }
          }
        }
      }
      const dataUrl = `data:image/png;base64,${buf.toString('base64')}`
      return {
        type: 'div', props: {
          style: { position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height, display: 'flex', overflow: 'hidden', borderRadius: radius },
          children: { type: 'img', props: { src: dataUrl, width: node.width, height: node.height, style: { width: '100%', height: '100%', objectFit: 'cover' } } }
        }
      }
    }

    if (node.type === 'shape') {
      const shape = node.shape || 'rect'
      const fill = node.fill || '#6366f1'
      const borderRadius = shape === 'ellipse' ? Math.max(node.width, node.height) : (node.borderRadius || 0)
      const style = {
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
        background: fill, borderRadius, display: 'flex',
      }
      if (node.strokeWidth && node.strokeWidth > 0) style.border = `${node.strokeWidth}px solid ${node.stroke || '#000000'}`
      return { type: 'div', props: { style } }
    }

    if (node.type === 'gradient') {
      const borderRadius = node.shape === 'ellipse' ? Math.max(node.width, node.height) : (node.borderRadius || 0)
      return {
        type: 'div', props: {
          style: {
            position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
            backgroundImage: buildGradientCss(node), borderRadius, display: 'flex',
          }
        }
      }
    }
    return null
  })

  const children = (await Promise.all(childPromises)).filter(Boolean)

  const tree = {
    type: 'div',
    props: {
      style: { width, height, background, position: 'relative', display: 'flex', fontFamily: 'Inter' },
      children
    }
  }

  const svg = await satori(tree, { width, height, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  let png = resvg.render().asPng()

  // Apply canvas-level color mode as a final pass
  if (canvas.colorMode && canvas.colorMode !== 'color') {
    try { png = await applyCanvasColorMode(png, canvas.colorMode) } catch (e) { console.error('colorMode error', e.message) }
  }
  return png
}
