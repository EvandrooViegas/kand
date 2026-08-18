/**
 * Render handlers for canvas output (PNG/ZIP)
 */

import { NextResponse } from 'next/server'
import { Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import JSZip from 'jszip'
import { corsify, getBaseUrl } from '@/lib/services/middleware'
import { renderCanvasToPng } from '@/lib/renderCanvas'

export async function handleRender(db: any, body: any, request: Request) {
  const canvaId = body.canva_id || body.canvas_id || body.canvaId
  if (!canvaId) return corsify(NextResponse.json({ error: 'canva_id is required' }, { status: 400 }))

  const canvas = await db.collection('canvases').findOne({ id: canvaId })
  if (!canvas) return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))

  const baseUrl = getBaseUrl(request)
  const renderId = uuidv4()

  if (canvas.type === 'carousel') {
    return await renderCarousel(db, canvas, body, renderId, baseUrl, canvaId)
  }

  return await renderSingle(db, canvas, body, renderId, baseUrl, canvaId)
}

async function renderCarousel(db: any, canvas: any, body: any, renderId: string, baseUrl: string, canvaId: string) {
  const { top_peer_data = {}, bottom_peer_data = {}, content = [] } = body
  const pages = [...(canvas.pages || [])].sort((a: any, b: any) => a.order - b.order)
  const zip = new JSZip()
  const renderResults = []

  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]
    let pageData: any = {}

    if (page.type === 'top_peer') {
      for (const [k, v] of Object.entries(top_peer_data)) {
        pageData[(k as string).replace(/_top$/, '')] = v
      }
      Object.assign(pageData, top_peer_data)
    } else if (page.type === 'bottom_peer') {
      for (const [k, v] of Object.entries(bottom_peer_data)) {
        pageData[(k as string).replace(/_bottom$/, '')] = v
      }
      Object.assign(pageData, bottom_peer_data)
    } else {
      const contentIdx = pages.filter((p: any, j: number) => p.type === 'content' && j < i).length
      const raw = content[contentIdx] || {}
      for (const [k, v] of Object.entries(raw)) {
        pageData[(k as string).replace(/_\d+$/, '')] = v
      }
      Object.assign(pageData, raw)
    }

    const pageCanvas = {
      ...canvas,
      nodes: page.nodes || [],
      groups: page.groups || [],
      classes: page.classes || {},
      background: page.background || canvas.background,
    }

    try {
      const png = await renderCanvasToPng(pageCanvas, pageData)
      const label =
        page.type === 'top_peer'
          ? '00-top-peer'
          : page.type === 'bottom_peer'
          ? `${String(pages.length - 1).padStart(2, '0')}-bottom-peer`
          : `${String(i).padStart(2, '0')}-${page.name || 'page'}`
      zip.file(`${label}.png`, png)
      renderResults.push({ pageId: page.id, type: page.type, order: i, filename: `${label}.png` })
    } catch (e) {
      console.error('carousel page render error', page.id, (e as Error).message)
      renderResults.push({ pageId: page.id, type: page.type, order: i, error: (e as Error).message })
    }
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
  await db.collection('renders').insertOne({
    id: renderId,
    canvasId: canvaId,
    type: 'carousel',
    zip: new Binary(zipBuf),
    pages: renderResults,
    payload: body,
    approved: false,
    createdAt: new Date(),
  })

  const zipUrl = `${baseUrl}/api/rendered/${renderId}.zip`
  return corsify(NextResponse.json({ url: zipUrl, render_id: renderId, canva_id: canvaId, type: 'carousel', pages: renderResults }))
}

async function renderSingle(db: any, canvas: any, body: any, renderId: string, baseUrl: string, canvaId: string) {
  const data = body.data || {}
  const png = await renderCanvasToPng(canvas, data)
  await db.collection('renders').insertOne({
    id: renderId,
    canvasId: canvaId,
    type: 'single',
    png: new Binary(png),
    payload: body,
    approved: false,
    createdAt: new Date(),
  })
  const url = `${baseUrl}/api/rendered/${renderId}`
  return corsify(NextResponse.json({ url, render_id: renderId, canva_id: canvaId, type: 'single' }))
}

export async function handleGetRendered(db: any, id: string) {
  const r = await db.collection('renders').findOne({ id })
  if (!r) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  if (r.type === 'carousel' && r.zip) {
    const buf = r.zip && typeof r.zip.value === 'function' ? r.zip.value() : Buffer.from(r.zip)
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="render-${id}.zip"`,
        'Cache-Control': 'public, max-age=86400',
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  const buf = r.png && typeof r.png.value === 'function' ? r.png.value() : Buffer.from(r.png)
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  })
}

export async function handleGetRenders(db: any) {
  const list = await db.collection('renders').find({}).sort({ createdAt: -1 }).limit(200).toArray()
  return corsify(NextResponse.json(list.map(({ _id, png, zip, ...rest }: any) => rest)))
}

export async function handleApproveRender(db: any, id: string) {
  await db.collection('renders').updateOne({ id }, { $set: { approved: true, approvedAt: new Date() } })
  return corsify(NextResponse.json({ success: true }))
}

export async function handleDeleteRender(db: any, id: string) {
  await db.collection('renders').deleteOne({ id })
  return corsify(NextResponse.json({ success: true }))
}
