import { MongoClient, Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { renderCanvasToPng } from '@/lib/renderCanvas'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
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
      const newCanvas = {
        id: uuidv4(),
        name: body.name || 'Untitled Canvas',
        width: body.width || 1080,
        height: body.height || 1080,
        background: body.background || '#ffffff',
        nodes: [],
        createdAt: new Date(),
        updatedAt: new Date()
      }
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

    // Render canvas to PNG
    if (route === '/render' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const canvaId = body.canva_id || body.canvas_id || body.canvaId
      const data = body.data || {}
      if (!canvaId) {
        return corsify(NextResponse.json({ error: 'canva_id is required' }, { status: 400 }))
      }
      const canvas = await db.collection('canvases').findOne({ id: canvaId })
      if (!canvas) {
        return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))
      }
      const png = await renderCanvasToPng(canvas, data)
      const renderId = uuidv4()
      await db.collection('renders').insertOne({
        id: renderId,
        canvasId: canvaId,
        png: new Binary(png),
        createdAt: new Date()
      })
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || ''
      const url = `${baseUrl}/api/rendered/${renderId}`
      return corsify(NextResponse.json({ url, render_id: renderId, canva_id: canvaId }))
    }

    // Serve rendered PNG
    const renderedMatch = route.match(/^\/rendered\/([^/]+?)(?:\.png)?$/)
    if (renderedMatch && method === 'GET') {
      const id = renderedMatch[1]
      const r = await db.collection('renders').findOne({ id })
      if (!r) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const buf = r.png?.buffer ? Buffer.from(r.png.buffer) : Buffer.from(r.png)
      return new NextResponse(buf, {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Cache-Control': 'public, max-age=86400',
          'Access-Control-Allow-Origin': '*',
        }
      })
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
