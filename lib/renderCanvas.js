import satori from 'satori'
import { Resvg } from '@resvg/resvg-js'
import { loadFontsForCanvas } from './fonts'

async function fetchAsDataUrl(url) {
  if (!url) return null
  if (url.startsWith('data:')) return url
  try {
    let finalUrl = url
    if (url.startsWith('/api/uploads/')) {
      const base = process.env.NEXT_PUBLIC_BASE_URL || ''
      finalUrl = base + url
    }
    const res = await fetch(finalUrl, { redirect: 'follow' })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    let ct = res.headers.get('content-type') || 'image/png'
    if (ct.includes(';')) ct = ct.split(';')[0].trim()
    return `data:${ct};base64,${buf.toString('base64')}`
  } catch (e) {
    console.error('fetchAsDataUrl error', url, e.message)
    return null
  }
}

function buildGradientCss(node) {
  const stops = (node.stops || [{ color: '#6366f1', position: 0 }, { color: '#ec4899', position: 100 }])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((s) => `${s.color} ${s.position || 0}%`)
    .join(', ')
  if (node.gradientType === 'radial') {
    return `radial-gradient(circle at center, ${stops})`
  }
  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
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
      return {
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
            color: node.color || '#000000',
            fontSize: node.fontSize || 48,
            fontWeight: node.fontWeight || 400,
            fontFamily: node.fontFamily || 'Inter',
            display: 'flex',
            alignItems: 'center',
            justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start',
            textAlign: align,
            lineHeight: 1.2,
            overflow: 'hidden',
            whiteSpace: 'pre-wrap',
          },
          children: text
        }
      }
    }
    if (node.type === 'image') {
      const src = dynVal || node.src
      const dataUrl = await fetchAsDataUrl(src)
      if (!dataUrl) {
        return {
          type: 'div',
          props: {
            style: {
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: node.width,
              height: node.height,
              background: '#e5e7eb',
              display: 'flex',
              borderRadius: node.borderRadius || 0,
            }
          }
        }
      }
      return {
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
            display: 'flex',
            overflow: 'hidden',
            borderRadius: node.borderRadius || 0,
          },
          children: {
            type: 'img',
            props: {
              src: dataUrl,
              width: node.width,
              height: node.height,
              style: { width: '100%', height: '100%', objectFit: 'cover' }
            }
          }
        }
      }
    }
    if (node.type === 'shape') {
      const shape = node.shape || 'rect'
      const fill = node.fill || '#6366f1'
      const borderRadius = shape === 'ellipse' ? Math.max(node.width, node.height) : (node.borderRadius || 0)
      const style = {
        position: 'absolute',
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
        background: fill,
        borderRadius,
        display: 'flex',
      }
      if (node.strokeWidth && node.strokeWidth > 0) {
        style.border = `${node.strokeWidth}px solid ${node.stroke || '#000000'}`
      }
      return { type: 'div', props: { style } }
    }
    if (node.type === 'gradient') {
      const borderRadius = node.shape === 'ellipse' ? Math.max(node.width, node.height) : (node.borderRadius || 0)
      return {
        type: 'div',
        props: {
          style: {
            position: 'absolute',
            left: node.x,
            top: node.y,
            width: node.width,
            height: node.height,
            backgroundImage: buildGradientCss(node),
            borderRadius,
            display: 'flex',
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
      style: {
        width,
        height,
        background,
        position: 'relative',
        display: 'flex',
        fontFamily: 'Inter',
      },
      children
    }
  }

  const svg = await satori(tree, { width, height, fonts })
  const resvg = new Resvg(svg, { fitTo: { mode: 'width', value: width } })
  return resvg.render().asPng()
}
