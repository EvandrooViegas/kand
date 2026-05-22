import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { loadFontsForCanvas } from './fonts'
import { parseStyledText, renderStyledText, parseImageTags, resolveCanvasClass } from './styleParser'

function resolveImageUrl(url) {
  if (!url) return null
  // Already a data URL
  if (url.startsWith('data:')) return url
  // Get the base URL, ensuring it has a protocol
  let base = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  if (base && !base.startsWith('http')) base = 'http://' + base
  // Relative path like /api/uploads/...
  if (url.startsWith('/')) return base + url
  // Protocol-missing like localhost:3000/api/...
  if (!url.startsWith('http')) return 'http://' + url
  // Absolute URL - use as-is but replace production base with the server-accessible base if needed
  return url
}

function sanitizeExternalUrl(url) {
  try {
    const u = new URL(url)
    // Google Drive: remove authuser param so server fetches publicly without a user session
    if (u.hostname.includes('drive.usercontent.google.com') || u.hostname.includes('drive.google.com')) {
      u.searchParams.delete('authuser')
    }
    return u.toString()
  } catch {
    return url
  }
}

async function fetchImageBuffer(url) {
  if (!url) return null
  try {
    if (url.startsWith('data:')) {
      const m = url.match(/^data:[^;]+;base64,(.+)$/)
      if (!m) return null
      return Buffer.from(m[1], 'base64')
    }
    const sanitized = sanitizeExternalUrl(url)
    const finalUrl = resolveImageUrl(sanitized)
    if (!finalUrl) return null
    const res = await fetch(finalUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    if (!res.ok) {
      console.error('fetchImageBuffer failed:', finalUrl, res.status)
      return null
    }
    // Reject non-image responses (e.g. HTML login pages from Google Drive)
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      console.error('fetchImageBuffer: expected image but got', contentType, 'for', finalUrl)
      return null
    }
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

function getCanvasClassStyle(canvasClasses = {}, className = '') {
  return resolveCanvasClass(canvasClasses, className)?.style || {}
}

export async function renderCanvasToPng(canvas, data = {}) {
  const fonts = await loadFontsForCanvas(canvas)
  const width = canvas.width || 1080
  const height = canvas.height || 1080
  const background = canvas.background || '#ffffff'

  const childPromises = (canvas.nodes || []).map(async (node) => {
    // Use the dynamic value from the request only if the key was actually provided
    // and has a non-empty value. Otherwise fall back to the original design value.
    const hasDynKey = node.dynamic_key && Object.prototype.hasOwnProperty.call(data, node.dynamic_key)
    const dynVal = hasDynKey ? data[node.dynamic_key] : undefined
    const hasValue = dynVal !== undefined && dynVal !== null && dynVal !== ''

    if (node.type === 'text') {
      const text = hasValue ? String(dynVal) : (node.text || '')
      const align = node.textAlign || 'left'
      
      const nodeClassStyles = getCanvasClassStyle(canvas.classes || {}, node.className)

      const style = {
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
        color: nodeClassStyles.color || node.color || '#000000',
        backgroundColor: nodeClassStyles.background || nodeClassStyles.backgroundColor || 'transparent',
        fontSize: node.fontSize || 48,
        fontWeight: nodeClassStyles.fontWeight || node.fontWeight || 400,
        fontStyle: nodeClassStyles.fontStyle || (node.fontStyle === 'italic' ? 'italic' : 'normal'),
        fontFamily: node.fontFamily || 'Inter',
        display: 'flex', flexDirection: 'column',
        justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
        textAlign: align, 
        lineHeight: node.lineHeight || 1.2, 
        letterSpacing: `${nodeClassStyles.letterSpacing || node.letterSpacing || 0}px`,
        textTransform: nodeClassStyles.textTransform || node.textTransform || 'none',
        textDecoration: nodeClassStyles.textDecoration || 'none',
        overflow: 'visible', whiteSpace: 'pre-wrap',
      }
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      
      const ts = nodeClassStyles.textShadow && nodeClassStyles.textShadow.enabled ? nodeClassStyles.textShadow : (node.textShadow && node.textShadow.enabled ? node.textShadow : null)
      if (ts) {
        style.textShadow = `${ts.offsetX || 0}px ${ts.offsetY || 0}px ${ts.blur || 0}px ${ts.color || '#000'}`
      }

      const parsedTokens = parseStyledText(text, canvas.classes || {})
      const styledChildren = renderStyledText(parsedTokens, null)

      return { type: 'div', props: { style, children: styledChildren } }
    }

    if (node.type === 'image') {
      // If a dynamic value was provided and it's non-empty, use it; otherwise fall back to the stored src
      const rawImageSrc = hasValue ? String(dynVal) : node.src
      const { url: imageSrc, filters: inlineFilters } = parseImageTags(rawImageSrc, canvas.classes || {})
      
      let buf = await fetchImageBuffer(imageSrc)
      
      let finalFilters = { ...(node.filters || {}) }
      const classStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      if (classStyle.filters) {
        finalFilters = { ...finalFilters, ...classStyle.filters }
      }
      if (inlineFilters) {
        finalFilters = { ...finalFilters, ...inlineFilters }
      }

      if (buf && Object.keys(finalFilters).length > 0) {
        try { buf = await applyImageFilters(buf, finalFilters) } catch (e) { console.error('filter error', e.message) }
      }
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      const radius = maskBorderRadius({ ...node, mask: clsStyle.mask || node.mask, borderRadius: clsStyle.borderRadius ?? node.borderRadius })
      if (!buf) {
        const style = { position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height, background: '#e5e7eb', display: 'flex', borderRadius: radius }
        if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
        return {
          type: 'div', props: { style }
        }
      }
      // Always normalise to PNG — Satori requires that the data: MIME type matches
      // the actual bytes. Raw fetched images can be JPEG/WebP/AVIF, so convert first.
      let pngBuf = buf
      try { pngBuf = await sharp(buf).png().toBuffer() } catch (e) { console.error('png convert error', e.message) }
      const dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`
      const style = { position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height, display: 'flex', overflow: 'hidden', borderRadius: radius }
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      return {
        type: 'div', props: {
          style,
          children: { type: 'img', props: { src: dataUrl, width: node.width, height: node.height, style: { width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center' } } }
        }
      }
    }

    if (node.type === 'shape') {
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      const shape = clsStyle.shape || node.shape || 'rect'
      const fill = clsStyle.fill || node.fill || '#6366f1'
      const borderRadius = shape === 'ellipse' ? Math.max(node.width, node.height) : (clsStyle.borderRadius ?? node.borderRadius ?? 0)
      const strokeWidth = clsStyle.strokeWidth ?? node.strokeWidth ?? 0
      const stroke = clsStyle.stroke || node.stroke || '#000000'
      const style = {
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
        background: fill, borderRadius, display: 'flex',
      }
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      if (strokeWidth > 0) style.border = `${strokeWidth}px solid ${stroke}`
      return { type: 'div', props: { style } }
    }

    if (node.type === 'gradient') {
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      const shape = clsStyle.shape || node.shape || 'rect'
      const borderRadius = shape === 'ellipse' ? Math.max(node.width, node.height) : (clsStyle.borderRadius ?? node.borderRadius ?? 0)
      const style = {
        position: 'absolute', left: node.x, top: node.y, width: node.width, height: node.height,
        backgroundImage: buildGradientCss({ ...node, ...clsStyle }), borderRadius, display: 'flex',
      }
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      return {
        type: 'div', props: { style }
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
