import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import sharp from 'sharp'
import { loadFontsForCanvas } from './fonts'
import { parseStyledText, buildSatoriTextLines, parseImageTags, resolveCanvasClass } from './styleParser'
import { normalizeGroupGaps, getNodeEffectiveDimensions } from './groups'

// text height calculation removed as Satori will handle flex layouts natively

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

// maskBorderRadius removed

// Returns CSS clip-path or borderRadius for a given image mask/shape
function getImageMaskStyle(mask, w, h) {
  const min = Math.min(w, h)
  switch (mask) {
    case 'circle':   return { borderRadius: '50%' }
    case 'rounded':  return { borderRadius: Math.round(min * 0.15) }
    case 'pill':     return { borderRadius: Math.round(min * 0.5) }
    case 'triangle': return { clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }
    case 'triangle-down': return { clipPath: 'polygon(0% 0%, 100% 0%, 50% 100%)' }
    case 'diamond':  return { clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)' }
    case 'pentagon': return { clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)' }
    case 'hexagon':  return { clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)' }
    case 'star':     return { clipPath: 'polygon(50% 0%, 61% 35%, 98% 35%, 68% 57%, 79% 91%, 50% 70%, 21% 91%, 32% 57%, 2% 35%, 39% 35%)' }
    case 'arrow-right': return { clipPath: 'polygon(0% 20%, 60% 20%, 60% 0%, 100% 50%, 60% 100%, 60% 80%, 0% 80%)' }
    case 'parallelogram': return { clipPath: 'polygon(15% 0%, 100% 0%, 85% 100%, 0% 100%)' }
    default:         return {}
  }
}

// Applies a polygon SVG mask to a PNG buffer using sharp (for renderCanvas)
async function applyShapeMaskToPng(pngBuf, mask, w, h) {
  if (!mask || mask === 'none') return pngBuf

  let svgShape = ''
  switch (mask) {
    case 'circle':
      svgShape = `<ellipse cx="${w/2}" cy="${h/2}" rx="${w/2}" ry="${h/2}" fill="white"/>`
      break
    case 'rounded': {
      const r = Math.round(Math.min(w, h) * 0.15)
      svgShape = `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>`
      break
    }
    case 'pill': {
      const r = Math.round(Math.min(w, h) * 0.5)
      svgShape = `<rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="white"/>`
      break
    }
    case 'triangle':
      svgShape = `<polygon points="${w*0.5},0 0,${h} ${w},${h}" fill="white"/>`
      break
    case 'triangle-down':
      svgShape = `<polygon points="0,0 ${w},0 ${w*0.5},${h}" fill="white"/>`
      break
    case 'diamond':
      svgShape = `<polygon points="${w*0.5},0 ${w},${h*0.5} ${w*0.5},${h} 0,${h*0.5}" fill="white"/>`
      break
    case 'pentagon':
      svgShape = `<polygon points="${w*0.5},0 ${w},${h*0.38} ${w*0.82},${h} ${w*0.18},${h} 0,${h*0.38}" fill="white"/>`
      break
    case 'hexagon':
      svgShape = `<polygon points="${w*0.25},0 ${w*0.75},0 ${w},${h*0.5} ${w*0.75},${h} ${w*0.25},${h} 0,${h*0.5}" fill="white"/>`
      break
    case 'star':
      svgShape = `<polygon points="${w*0.5},0 ${w*0.61},${h*0.35} ${w*0.98},${h*0.35} ${w*0.68},${h*0.57} ${w*0.79},${h*0.91} ${w*0.5},${h*0.70} ${w*0.21},${h*0.91} ${w*0.32},${h*0.57} ${w*0.02},${h*0.35} ${w*0.39},${h*0.35}" fill="white"/>`
      break
    case 'arrow-right':
      svgShape = `<polygon points="0,${h*0.2} ${w*0.6},${h*0.2} ${w*0.6},0 ${w},${h*0.5} ${w*0.6},${h} ${w*0.6},${h*0.8} 0,${h*0.8}" fill="white"/>`
      break
    case 'parallelogram':
      svgShape = `<polygon points="${w*0.15},0 ${w},0 ${w*0.85},${h} 0,${h}" fill="white"/>`
      break
    default:
      return pngBuf
  }

  const maskSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">${svgShape}</svg>`
  )
  try {
    // Resize image to target dimensions, then composite SVG mask as alpha channel
    const resized = await sharp(pngBuf).resize(w, h).ensureAlpha().png().toBuffer()
    const maskBuf = await sharp(maskSvg).resize(w, h).ensureAlpha().png().toBuffer()
    // Multiply alpha: keep only pixels where mask is white
    const { data: imgData, info } = await sharp(resized).raw().toBuffer({ resolveWithObject: true })
    const { data: maskData } = await sharp(maskBuf).raw().toBuffer({ resolveWithObject: true })
    const out = Buffer.from(imgData)
    for (let i = 0; i < info.width * info.height; i++) {
      // mask alpha is stored at index i*4+3 but mask is RGB; use red channel (i*4) as alpha weight
      const maskAlpha = maskData[i * 4] / 255
      out[i * 4 + 3] = Math.round(imgData[i * 4 + 3] * maskAlpha)
    }
    return await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer()
  } catch (e) {
    console.error('applyShapeMaskToPng error', e.message)
    return pngBuf
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

  let nodes = canvas.nodes || []

  const groupMap = new Map()
  const nodeToGroupId = new Map()
  
  if (canvas.groups && canvas.groups.length > 0) {
    for (const group of canvas.groups) {
      groupMap.set(group.id, group)
      for (const nodeId of group.nodeIds) {
        nodeToGroupId.set(nodeId, group.id)
      }
    }
  }

  const childPromises = nodes.map(async (node) => {
    // Use the dynamic value from the request only if the key was actually provided
    // and has a non-empty value. Otherwise fall back to the original design value.
    const hasDynKey = node.dynamic_key && Object.prototype.hasOwnProperty.call(data, node.dynamic_key)
    const dynVal = hasDynKey ? data[node.dynamic_key] : undefined
    const hasValue = dynVal !== undefined && dynVal !== null && dynVal !== ''

    const isGrouped = nodeToGroupId.has(node.id)
    const group = isGrouped ? groupMap.get(nodeToGroupId.get(node.id)) : null
    
    let position = 'absolute'
    let left = node.x
    let top = node.y
    let height = node.height
    let marginTop = 0
    let marginLeft = 0

    if (isGrouped) {
      position = 'relative'
      left = undefined
      top = undefined
      
      // Use the visible (cropped) dimensions so the flex container sizes to the actual visible area
      const effDims = getNodeEffectiveDimensions(node)
      
      const idx = group.nodeIds.indexOf(node.id)
      if (idx > 0) {
        const gaps = normalizeGroupGaps(group)
        const gap = gaps[idx - 1] || { gapX: 0, gapY: 0 }
        marginTop = gap.gapY || 0
        marginLeft = gap.gapX || 0
      }
      
      // Override width/height with effective (cropped) values for the flex item
      if (node.type === 'image') {
        height = Math.round(effDims.height)
      }
    }

    if (node.type === 'text') {
      const text = hasValue ? String(dynVal) : (node.text || '')
      if (!text) return null
      
      const align = node.textAlign || 'left'

      // Allow Satori to calculate natural height for grouped text nodes
      if (isGrouped) {
        height = undefined
      }

      const nodeClassStyles = getCanvasClassStyle(canvas.classes || {}, node.className)

      const style = {
        position, width: node.width, marginTop, marginLeft,
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
        overflow: isGrouped ? 'visible' : 'hidden',
        whiteSpace: 'normal',
        wordBreak: 'break-word',
        overflowWrap: 'break-word',
      }
      if (left !== undefined) style.left = left
      if (top !== undefined) style.top = top
      if (height !== undefined) style.height = height
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      
      const ts = nodeClassStyles.textShadow && nodeClassStyles.textShadow.enabled ? nodeClassStyles.textShadow : (node.textShadow && node.textShadow.enabled ? node.textShadow : null)
      if (ts) {
        style.textShadow = `${ts.offsetX || 0}px ${ts.offsetY || 0}px ${ts.blur || 0}px ${ts.color || '#000'}`
      }

      const parsedTokens = parseStyledText(text, canvas.classes || {})
      const lineNodes = buildSatoriTextLines(parsedTokens, canvas.classes || {}, {
        align,
        lineHeight: node.lineHeight || 1.2,
      })

      return {
        nodeId: node.id,
        element: {
          type: 'div',
          props: {
            style,
            children: lineNodes.length === 1 ? lineNodes[0] : lineNodes,
          },
        }
      }
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
      const mask = clsStyle.mask || node.mask || 'none'
      const radius = clsStyle.borderRadius ?? node.borderRadius ?? 0

      // For CSS-only masks (circle/rounded/pill), use borderRadius on the wrapper.
      // For polygon masks, we apply a sharp SVG mask to the pixel buffer instead.
      const cssOnlyMasks = ['none', 'circle', 'rounded', 'pill']
      const useSvgMask = mask !== 'none' && !cssOnlyMasks.includes(mask)
      const wrapperRadius = (() => {
        if (mask === 'circle') return '50%'
        if (mask === 'rounded') return Math.round(Math.min(node.width, node.height) * 0.15)
        if (mask === 'pill') return Math.round(Math.min(node.width, node.height) * 0.5)
        return radius
      })()
      if (!buf) {
        const effDims = getNodeEffectiveDimensions(node)
        const fbWidth = isGrouped ? Math.round(effDims.width) : node.width
        const fbHeight = isGrouped ? Math.round(effDims.height) : (height !== undefined ? height : node.height)
        const style = { position, width: fbWidth, marginTop, marginLeft, background: '#e5e7eb', display: 'flex', borderRadius: wrapperRadius }
        if (left !== undefined) style.left = left
        if (top !== undefined) style.top = top
        style.height = fbHeight
        if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
        return {
          nodeId: node.id,
          element: { type: 'div', props: { style } }
        }
      }
      // Always normalise to PNG first (Satori needs PNG data URLs)
      let pngBuf = buf
      try { pngBuf = await sharp(buf).png().toBuffer() } catch (e) { console.error('png convert error', e.message) }

      // Apply physical crop via sharp.extract() — this is a true pixel cut, not a zoom.
      // Matches the clip-path: inset() used on the client side.
      const cL = node.cropLeft || 0
      const cR = node.cropRight || 0
      const cT = node.cropTop || 0
      const cB = node.cropBottom || 0
      if (cL > 0 || cR > 0 || cT > 0 || cB > 0) {
        try {
          const meta = await sharp(pngBuf).metadata()
          const imgW = meta.width || node.width
          const imgH = meta.height || node.height
          const extractLeft = Math.round((cL / 100) * imgW)
          const extractTop = Math.round((cT / 100) * imgH)
          const extractWidth = Math.max(1, Math.round(((100 - cL - cR) / 100) * imgW))
          const extractHeight = Math.max(1, Math.round(((100 - cT - cB) / 100) * imgH))
          pngBuf = await sharp(pngBuf)
            .extract({ left: extractLeft, top: extractTop, width: extractWidth, height: extractHeight })
            .png()
            .toBuffer()
        } catch (e) { console.error('crop extract error', e.message) }
      }

      // Apply SVG shape mask for polygon shapes (triangle, diamond, star, etc.)
      if (useSvgMask) {
        try {
          const meta = await sharp(pngBuf).metadata()
          const mw = meta.width || node.width
          const mh = meta.height || node.height
          pngBuf = await applyShapeMaskToPng(pngBuf, mask, mw, mh)
        } catch (e) { console.error('shape mask error', e.message) }
      }

      const dataUrl = `data:image/png;base64,${pngBuf.toString('base64')}`
      // For grouped nodes, use the effective (cropped) dimensions so the flex item
      // takes up only the visible area, not the full original size.
      const effDims = getNodeEffectiveDimensions(node)
      const renderWidth = isGrouped ? Math.round(effDims.width) : node.width
      const renderHeight = isGrouped ? Math.round(effDims.height) : (height !== undefined ? height : node.height)
      const style = { position, width: renderWidth, marginTop, marginLeft, display: 'flex', overflow: 'hidden', borderRadius: wrapperRadius }
      if (left !== undefined) style.left = left
      if (top !== undefined) style.top = top
      if (!isGrouped && height !== undefined) style.height = height
      if (isGrouped) style.height = renderHeight
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`

      return {
        nodeId: node.id,
        element: {
          type: 'div', props: {
            style,
            children: {
              type: 'img',
              props: {
                src: dataUrl,
                style: { width: '100%', height: '100%', objectFit: 'cover' }
              }
            }
          }
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
        position, width: node.width, marginTop, marginLeft,
        background: fill, borderRadius, display: 'flex',
      }
      if (left !== undefined) style.left = left
      if (top !== undefined) style.top = top
      if (height !== undefined) style.height = height
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      if (strokeWidth > 0) style.border = `${strokeWidth}px solid ${stroke}`
      return { nodeId: node.id, element: { type: 'div', props: { style } } }
    }

    if (node.type === 'gradient') {
      const clsStyle = getCanvasClassStyle(canvas.classes || {}, node.className)
      const shape = clsStyle.shape || node.shape || 'rect'
      const borderRadius = shape === 'ellipse' ? Math.max(node.width, node.height) : (clsStyle.borderRadius ?? node.borderRadius ?? 0)
      const style = {
        position, width: node.width, marginTop, marginLeft,
        backgroundImage: buildGradientCss({ ...node, ...clsStyle }), borderRadius, display: 'flex',
      }
      if (left !== undefined) style.left = left
      if (top !== undefined) style.top = top
      if (height !== undefined) style.height = height
      if (node.rotation) style.transform = `rotate(${node.rotation}deg)`
      return {
        nodeId: node.id,
        element: { type: 'div', props: { style } }
      }
    }
    return null
  })

  const resolvedChildren = (await Promise.all(childPromises)).filter(Boolean)
  const satoriElementsMap = new Map()
  for (const item of resolvedChildren) {
    if (item.element) satoriElementsMap.set(item.nodeId, item.element)
  }

  const finalChildren = []
  const processedGroups = new Set()

  for (const node of nodes) {
    if (nodeToGroupId.has(node.id)) {
      const groupId = nodeToGroupId.get(node.id)
      if (processedGroups.has(groupId)) continue
      processedGroups.add(groupId)

      const group = groupMap.get(groupId)
      const groupElements = []
      for (const id of group.nodeIds) {
        if (satoriElementsMap.has(id)) {
          groupElements.push(satoriElementsMap.get(id))
        }
      }

      const firstNode = nodes.find(n => n.id === group.nodeIds[0])
      if (!firstNode) continue

      // Anchor the group container at the visible top-left of the first node
      const firstEffDims = getNodeEffectiveDimensions(firstNode)
      const groupLeft = firstNode.x + firstEffDims.offsetX
      const groupTop = firstNode.y + firstEffDims.offsetY

      finalChildren.push({
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            left: groupLeft,
            top: groupTop,
            display: 'flex',
            flexDirection: group.layout === 'vertical' ? 'column' : 'row',
            alignItems: 'flex-start',
          },
          children: groupElements
        }
      })
    } else {
      if (satoriElementsMap.has(node.id)) {
        finalChildren.push(satoriElementsMap.get(node.id))
      }
    }
  }

  const tree = {
    type: 'div',
    props: {
      style: { width, height, background, position: 'relative', display: 'flex', fontFamily: 'Inter' },
      children: finalChildren
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
