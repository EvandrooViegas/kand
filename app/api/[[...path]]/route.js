import { MongoClient, Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { renderCanvasToPng } from '@/lib/renderCanvas'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let client
let db

async function connectToMongo() {
  if (!client) {
    // 1. Added your database name 'kand' directly into the fallback connection string path
    console.log("Mongo URL:", process.env.MONGO_URL)
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    
    // 2. Changed the default fallback database name from "admin" to "kand"
    db = client.db(process.env.DB_NAME)
  }
  return db
}

function corsify(response) {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

export async function OPTIONS() {
  return corsify(new NextResponse(null, { status: 200 }))
}

function getBaseUrl(request) {
  // Prefer explicit env var if set
  const envBase = process.env.NEXT_PUBLIC_BASE_URL
  if (envBase) {
    let b = envBase.trim()
    if (!b.startsWith('http')) b = (b.includes('localhost') ? 'http://' : 'https://') + b
    return b
  }
  // Derive from incoming request headers (works on Vercel, Render, etc.)
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  return `${proto}://${host}`
}

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    if (route === '/' && method === 'GET') {
      return corsify(NextResponse.json({ message: 'DynaCanvas API' }))
    }

    // List canvases
    if (route === '/canvases' && method === 'GET') { 
      const list = await db.collection('canvases').find({}).sort({ updatedAt: -1 }).limit(500).toArray()
      return corsify(NextResponse.json(list.map(({ _id, ...rest }) => rest)))
    }

    // Create canvas
    if (route === '/canvases' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const isCarousel = body.type === 'carousel'
      const w = body.width || 1080
      const h = body.height || 1080
      const bg = body.background || '#ffffff'
      const newCanvas = {
        id: uuidv4(),
        name: body.name || 'Untitled Canvas',
        type: isCarousel ? 'carousel' : 'single',
        width: w,
        height: h,
        background: bg,
        nodes: [],
        groups: [],
        classes: {},
        // Carousel: pages each have their own independent design.
        // width/height are stored at root and shared (global preset).
        ...(isCarousel ? {
          pages: [
            { id: uuidv4(), type: 'top_peer',    name: 'Top Peer (Hook)',   order: 0, nodes: [], groups: [], classes: {}, background: bg },
            { id: uuidv4(), type: 'content',     name: 'Page 1',            order: 1, nodes: [], groups: [], classes: {}, background: bg },
            { id: uuidv4(), type: 'bottom_peer', name: 'Bottom Peer (CTA)', order: 2, nodes: [], groups: [], classes: {}, background: bg },
          ]
        } : {}),
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await db.collection('canvases').insertOne(newCanvas)
      const { _id, ...rest } = newCanvas
      return corsify(NextResponse.json(rest))
    }

    // Duplicate canvas
    const dupMatch = route.match(/^\/canvases\/([^/]+)\/duplicate$/)
    if (dupMatch && method === 'POST') {
      const srcId = dupMatch[1]
      const src = await db.collection('canvases').findOne({ id: srcId })
      if (!src) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const newCanvas = {
        ...src,
        id: uuidv4(),
        name: (src.name || 'Canvas') + ' (Copy)',
        nodes: (src.nodes || []).map((n) => ({ ...n, id: uuidv4() })),
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      delete newCanvas._id
      await db.collection('canvases').insertOne(newCanvas)
      const { _id, ...rest } = newCanvas
      return corsify(NextResponse.json(rest))
    }

    // Single canvas operations
    const canvasMatch = route.match(/^\/canvases\/([^/]+)$/)
    if (canvasMatch) {
      const id = canvasMatch[1]
      if (method === 'GET') {
        const c = await db.collection('canvases').findOne({ id })
        if (!c) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
        const { _id, ...rest } = c
        return corsify(NextResponse.json(rest))
      }
      if (method === 'PUT') {
        const body = await request.json()
        const update = { ...body, id, updatedAt: new Date() }
        delete update._id
        delete update.createdAt
        await db.collection('canvases').updateOne({ id }, { $set: update })
        const c = await db.collection('canvases').findOne({ id })
        const { _id, ...rest } = c || {}
        return corsify(NextResponse.json(rest))
      }
      if (method === 'DELETE') {
        await db.collection('canvases').deleteOne({ id })
        return corsify(NextResponse.json({ success: true }))
      }
    }

    // Image uploads: accept base64 data URL in JSON body
    if (route === '/uploads' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const dataUrl = body.data
      if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
        return corsify(NextResponse.json({ error: 'data must be a data: URL string' }, { status: 400 }))
      }
      const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) return corsify(NextResponse.json({ error: 'Invalid data URL' }, { status: 400 }))
      const contentType = match[1]
      const buf = Buffer.from(match[2], 'base64')
      if (buf.length > 6 * 1024 * 1024) {
        return corsify(NextResponse.json({ error: 'Image too large (max 6MB)' }, { status: 413 }))
      }
      const uploadId = uuidv4()
      await db.collection('uploads').insertOne({
        id: uploadId,
        contentType,
        bytes: new Binary(buf),
        createdAt: new Date(),
      })
      const baseUrl = getBaseUrl(request)
      return corsify(NextResponse.json({
        id: uploadId,
        url: `${baseUrl}/api/uploads/${uploadId}`,
        relativeUrl: `/api/uploads/${uploadId}`,
      }))
    }

    // Serve uploaded image
    const uploadMatch = route.match(/^\/uploads\/([^/]+)$/)
if (uploadMatch && method === 'GET') {
  const id = uploadMatch[1]
  const u = await db.collection('uploads').findOne({ id })
  if (!u) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  
  // FIX: Use .value() if it's a MongoDB Binary object, otherwise fall back safely
  const buf = u.bytes && typeof u.bytes.value === 'function' ? u.bytes.value() : Buffer.from(u.bytes)
  
  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': u.contentType || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    }
  })
}

    // Render canvas to PNG (single) or carousel (ZIP)
    if (route === '/render' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const canvaId = body.canva_id || body.canvas_id || body.canvaId
      if (!canvaId) {
        return corsify(NextResponse.json({ error: 'canva_id is required' }, { status: 400 }))
      }
      const canvas = await db.collection('canvases').findOne({ id: canvaId })
      if (!canvas) {
        return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))
      }
      const baseUrl = getBaseUrl(request)
      const renderId = uuidv4()

      // ── CAROUSEL render ────────────────────────────────────────────────────
      if (canvas.type === 'carousel') {
        const { top_peer_data = {}, bottom_peer_data = {}, content = [] } = body
        const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
        const zip = new JSZip()
        const renderResults = []

        for (let i = 0; i < pages.length; i++) {
          const page = pages[i]
          // Pick the data set for this page
          let pageData = {}
          if (page.type === 'top_peer') {
            // Remap top_peer_data keys: strip _top suffix to match dynamic_key
            for (const [k, v] of Object.entries(top_peer_data)) {
              pageData[k.replace(/_top$/, '')] = v
            }
            // Also allow exact key match
            Object.assign(pageData, top_peer_data)
          } else if (page.type === 'bottom_peer') {
            for (const [k, v] of Object.entries(bottom_peer_data)) {
              pageData[k.replace(/_bottom$/, '')] = v
            }
            Object.assign(pageData, bottom_peer_data)
          } else {
            // content pages in order (index among content pages)
            const contentIdx = pages.filter((p, j) => p.type === 'content' && j < i).length
            const raw = content[contentIdx] || {}
            // Remap _N suffix: hook_1 → hook, img_1 → img etc.
            for (const [k, v] of Object.entries(raw)) {
              pageData[k.replace(/_\d+$/, '')] = v
            }
            Object.assign(pageData, raw)
          }

          // Each page has its own design. Width/height come from root canvas (global).
          const pageCanvas = {
            ...canvas,
            nodes:      page.nodes      || [],
            groups:     page.groups     || [],
            classes:    page.classes    || {},
            background: page.background || canvas.background,
            // width/height always from root
          }
          try {
            const png = await renderCanvasToPng(pageCanvas, pageData)
            const label = page.type === 'top_peer' ? '00-top-peer'
              : page.type === 'bottom_peer' ? `${String(pages.length - 1).padStart(2, '0')}-bottom-peer`
              : `${String(i).padStart(2, '0')}-${page.name || 'page'}`
            zip.file(`${label}.png`, png)
            renderResults.push({ pageId: page.id, type: page.type, order: i, filename: `${label}.png` })
          } catch (e) {
            console.error('carousel page render error', page.id, e.message)
            renderResults.push({ pageId: page.id, type: page.type, order: i, error: e.message })
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

      // ── SINGLE render ──────────────────────────────────────────────────────
      const data = body.data || {}
      const png = await renderCanvasToPng(canvas, data)
      await db.collection('renders').insertOne({
        id: renderId,
        canvasId: canvaId,
        type: 'single',
        png: new Binary(png),
        payload: body,
        approved: false,
        createdAt: new Date()
      })
      const url = `${baseUrl}/api/rendered/${renderId}`
      return corsify(NextResponse.json({ url, render_id: renderId, canva_id: canvaId, type: 'single' }))
    }

    // Serve rendered PNG or ZIP
    const renderedMatch = route.match(/^\/rendered\/([^/]+?)(?:\.(png|zip))?$/)
    if (renderedMatch && method === 'GET') {
      const id = renderedMatch[1]
      const r = await db.collection('renders').findOne({ id })
      if (!r) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      if (r.type === 'carousel' && r.zip) {
        const buf = r.zip && typeof r.zip.value === 'function' ? r.zip.value() : Buffer.from(r.zip)
        return new NextResponse(buf, {
          status: 200,
          headers: { 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="render-${id}.zip"`, 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' }
        })
      }
      const buf = r.png && typeof r.png.value === 'function' ? r.png.value() : Buffer.from(r.png)
      return new NextResponse(buf, {
        status: 200,
        headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' }
      })
    }

    // List all renders (dashboard)
    if (route === '/renders' && method === 'GET') {
      const list = await db.collection('renders').find({}).sort({ createdAt: -1 }).limit(200).toArray()
      return corsify(NextResponse.json(list.map(({ _id, png, zip, ...rest }) => rest)))
    }

    // Approve a render
    const renderApproveMatch = route.match(/^\/renders\/([^/]+)\/approve$/)
    if (renderApproveMatch && method === 'POST') {
      const id = renderApproveMatch[1]
      await db.collection('renders').updateOne({ id }, { $set: { approved: true, approvedAt: new Date() } })
      return corsify(NextResponse.json({ success: true }))
    }

    // Delete a render
    const renderDeleteMatch = route.match(/^\/renders\/([^/]+)$/)
    if (renderDeleteMatch && method === 'DELETE') {
      const id = renderDeleteMatch[1]
      await db.collection('renders').deleteOne({ id })
      return corsify(NextResponse.json({ success: true }))
    }

    return corsify(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (error) {
    console.error('API Error:', error)
    return corsify(NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 }))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
