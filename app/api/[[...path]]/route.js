import { MongoClient, Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { renderCanvasToPng } from '@/lib/renderCanvas'
import JSZip from 'jszip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let client
let db
let connectPromise = null

async function connectToMongo() {
  if (db) return db
  if (!connectPromise) {
    connectPromise = (async () => {
      console.log("Mongo URL:", process.env.MONGO_URL)
      client = new MongoClient(process.env.MONGO_URL, { serverSelectionTimeoutMS: 10000 })
      await client.connect()
      db = client.db(process.env.DB_NAME)
      return db
    })().catch(err => {
      // Reset so future calls can retry
      connectPromise = null
      client = null
      throw err
    })
  }
  return connectPromise
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

// ────────────────────────────────────────────────────────────────
// AI MODEL CONFIG
// ────────────────────────────────────────────────────────────────
// Groq is free-tier friendly and fast. Model choice matters a lot:
// - llama-3.3-70b-versatile  → main model for copywriting/ideation (best quality on Groq free tier)
// - llama-3.1-8b-instant     → fast/cheap model for tiny tasks (short captions, JSON extraction)
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL_MAIN  = 'llama-3.3-70b-versatile'
const MODEL_FAST  = 'llama-3.1-8b-instant'

const LANGUAGE_NAMES = {
  english: 'English', spanish: 'Spanish', french: 'French', german: 'German',
  italian: 'Italian', portuguese: 'Portuguese', dutch: 'Dutch', polish: 'Polish',
  swedish: 'Swedish', russian: 'Russian', japanese: 'Japanese',
  chinese: 'Chinese (Simplified)', korean: 'Korean', arabic: 'Arabic',
}

const TONE_DESCS = {
  informative: 'Clear, factual, educational — deliver a useful insight in a calm authoritative way.',
  helpful:     'Warm, empathetic, solution-focused — talk to the reader like a trusted friend giving real help.',
  aggressive:  'Bold, urgent, FOMO-driven — challenge the reader, break patterns, create urgency to act NOW.',
  inspiring:   'Motivational, aspirational, emotional — make the reader feel that change is possible for them.',
  playful:     'Fun, witty, conversational — light-hearted, a bit surprising, human in every sentence.',
}

// Groq call with retry + exponential backoff. Always returns the raw text (or throws after N attempts).
async function callGroq({ prompt, model = MODEL_MAIN, temperature = 0.85, maxTokens = 500, jsonMode = false, retries = 3 }) {
  const key = process.env.GROQ_API_KEY
  if (!key) throw new Error('GROQ_API_KEY not set')
  let lastError = null
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature + (attempt * 0.03),
      }
      if (jsonMode) body.response_format = { type: 'json_object' }
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const err = await res.text().catch(() => '')
        lastError = new Error(`Groq ${res.status}: ${err.slice(0, 200)}`)
        if (res.status === 429 || res.status >= 500) {
          await new Promise(r => setTimeout(r, 900 * (attempt + 1)))
          continue
        }
        throw lastError
      }
      const data = await res.json()
      return data.choices?.[0]?.message?.content?.trim() || ''
    } catch (e) {
      lastError = e
      if (attempt < retries - 1) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
    }
  }
  throw lastError || new Error('Groq call failed')
}

function extractJson(text, fallback = null) {
  if (!text) return fallback
  // Try direct parse first (works with jsonMode)
  try { return JSON.parse(text) } catch (_) { /* pass */ }
  // Try to find a JSON object or array in the text
  const objMatch = text.match(/\{[\s\S]*\}/)
  const arrMatch = text.match(/\[[\s\S]*\]/)
  const candidates = [objMatch?.[0], arrMatch?.[0]].filter(Boolean)
  for (const c of candidates) {
    try { return JSON.parse(c) } catch (_) { /* pass */ }
  }
  return fallback
}

// ────────────────────────────────────────────────────────────────
// BRAND PROFILE BUILDER
// ────────────────────────────────────────────────────────────────
// Assembles ALL brand context into a single structured markdown-like
// block that's injected into every downstream AI prompt.
// This is the single source of truth for "what the AI knows about the brand".
function buildBrandProfile(flow, opts = {}) {
  const brand      = flow?.brandContext || {}
  const answers    = flow?.brandAnswers || {}
  const questions  = flow?.brandQuestions || []
  const extracted  = flow?.extractedContext || ''
  const tone       = flow?.tone || 'informative'
  const language   = flow?.language || 'english'
  const languageName = LANGUAGE_NAMES[language] || 'English'
  const toneDesc     = TONE_DESCS[tone] || TONE_DESCS.informative

  // Q&A block — this is high-value, insider knowledge
  const qaLines = questions
    .map((q, i) => {
      const a = answers[i] || answers[String(i)]
      if (!a || !String(a).trim()) return null
      return `  • Q: ${q}\n    A: ${String(a).trim()}`
    })
    .filter(Boolean)

  const lines = []
  lines.push(`## BRAND PROFILE`)
  if (brand.businessName) lines.push(`- Business Name: ${brand.businessName}`)
  if (brand.description)  lines.push(`- What they do: ${brand.description}`)
  if (brand.audience)     lines.push(`- Target Audience: ${brand.audience}`)
  if (brand.voice)        lines.push(`- Brand Voice / Personality: ${brand.voice}`)
  if (brand.instagram)    lines.push(`- Instagram Handle: @${brand.instagram}`)
  if (brand.extra)        lines.push(`- Additional Context: ${brand.extra}`)
  if (extracted && !brand.description) {
    lines.push(`- Website Summary (auto-extracted):\n${extracted.split('\n').map(l => '    ' + l).join('\n')}`)
  }
  if (qaLines.length > 0) {
    lines.push('')
    lines.push(`## STRATEGIC INSIGHTS (from the brand owner)`)
    lines.push(qaLines.join('\n'))
  }
  lines.push('')
  lines.push(`## STYLE DIRECTIVES`)
  lines.push(`- Language: write EVERYTHING in ${languageName}. Never use another language.`)
  lines.push(`- Tone: ${toneDesc}`)
  lines.push(`- No hashtags, no emojis, no markdown, no quotes wrapping the text.`)
  if (opts.extraDirectives) lines.push(opts.extraDirectives)
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────
// CANVAS LAYOUT DESCRIBER
// ────────────────────────────────────────────────────────────────
// Converts raw node JSON into a human-readable visual description
// so the AI *understands* the layout instead of parsing coordinates.
function describeCanvasLayout(canvas, nodes) {
  const W = canvas.width || 1080
  const H = canvas.height || 1080
  const orient = W > H ? 'landscape' : (W < H ? 'portrait' : 'square')

  const zoneOf = (x, y, w, h) => {
    const cx = x + w / 2, cy = y + h / 2
    const col = cx < W / 3 ? 'left' : (cx > (2 * W) / 3 ? 'right' : 'center')
    const row = cy < H / 3 ? 'top' : (cy > (2 * H) / 3 ? 'bottom' : 'middle')
    return `${row}-${col}`
  }

  const sortedNodes = [...(nodes || [])].sort((a, b) => (a.y || 0) - (b.y || 0))
  const layers = []
  for (const n of sortedNodes) {
    if (!n.dynamic_key) continue // Only describe dynamic slots
    const zone = zoneOf(n.x || 0, n.y || 0, n.width || 100, n.height || 40)
    if (n.type === 'image') {
      layers.push(`  • {${n.dynamic_key}} → IMAGE slot in ${zone} (${Math.round(n.width)}×${Math.round(n.height)}px)`)
    } else {
      const size = n.fontSize || 32
      const align = n.textAlign || 'left'
      const weight = n.fontWeight || 400
      const family = n.fontFamily || 'sans-serif'
      const role =
        size >= 72 ? 'HERO HEADLINE' :
        size >= 48 ? 'headline' :
        size >= 30 ? 'sub-headline' :
        size >= 20 ? 'body copy' : 'caption/small text'
      const weightLabel = weight >= 700 ? 'bold' : weight >= 500 ? 'medium' : 'regular'
      layers.push(`  • {${n.dynamic_key}} → TEXT ${role} in ${zone}, ${size}px ${weightLabel} ${family}, ${align}-aligned (box ${Math.round(n.width)}×${Math.round(n.height)}px)`)
    }
  }

  const lines = []
  lines.push(`## CANVAS LAYOUT — "${canvas.name}"`)
  lines.push(`- Format: ${W}×${H} ${orient} (${orient === 'square' ? '1:1 for Instagram feed' : orient === 'portrait' ? 'vertical for Reels/Stories vibe' : 'landscape'})`)
  if (canvas.background) lines.push(`- Background: ${typeof canvas.background === 'string' ? canvas.background : 'custom'}`)
  if (layers.length === 0) {
    lines.push(`- No dynamic slots in this layout.`)
  } else {
    lines.push(`- Dynamic slots (in reading order):`)
    lines.push(layers.join('\n'))
  }
  return lines.join('\n')
}

// ────────────────────────────────────────────────────────────────
// RECENT POSTS CONTEXT (avoids repetition across batches)
// ────────────────────────────────────────────────────────────────
function buildRecentPostsContext(existingPosts, maxItems = 6) {
  const recent = (existingPosts || [])
    .filter(p => p.status !== 'deleted' && p.caption)
    .slice(-maxItems)
  if (recent.length === 0) return ''
  const lines = [`## POSTS ALREADY GENERATED (do NOT repeat these angles, hooks, or phrasing)`]
  recent.forEach((p, i) => {
    const cap = String(p.caption).slice(0, 140).replace(/\s+/g, ' ')
    lines.push(`  ${i + 1}. [${p.canvasType || 'single'}] "${cap}"`)
  })
  lines.push(`Every new post MUST take a fundamentally different angle from the ones above.`)
  return lines.join('\n')
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

    // ── GALLERY ROUTES ─────────────────────────────────────────────────────

    // List galleries
    if (route === '/galleries' && method === 'GET') {
      const list = await db.collection('galleries').find({}).sort({ updatedAt: -1 }).toArray()
      return corsify(NextResponse.json(list.map(({ _id, ...r }) => r)))
    }
    // Create gallery
    if (route === '/galleries' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const gallery = { id: uuidv4(), name: body.name || 'Untitled Gallery', images: body.images || [], createdAt: new Date(), updatedAt: new Date() }
      await db.collection('galleries').insertOne(gallery)
      const { _id, ...rest } = gallery
      return corsify(NextResponse.json(rest))
    }
    // Single gallery CRUD
    const galleryMatch = route.match(/^\/galleries\/([^/]+)$/)
    if (galleryMatch) {
      const id = galleryMatch[1]
      if (method === 'GET') {
        const g = await db.collection('galleries').findOne({ id })
        if (!g) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
        const { _id, ...rest } = g; return corsify(NextResponse.json(rest))
      }
      if (method === 'PUT') {
        const body = await request.json()
        const update = { ...body, id, updatedAt: new Date() }
        delete update._id; delete update.createdAt
        await db.collection('galleries').updateOne({ id }, { $set: update })
        const g = await db.collection('galleries').findOne({ id })
        const { _id, ...rest } = g || {}; return corsify(NextResponse.json(rest))
      }
      if (method === 'DELETE') {
        await db.collection('galleries').deleteOne({ id })
        return corsify(NextResponse.json({ success: true }))
      }
    }

    // ── FLOW ROUTES ────────────────────────────────────────────────────────

    // List flows
    if (route === '/flows' && method === 'GET') {
      const list = await db.collection('flows').find({}).sort({ updatedAt: -1 }).limit(200).toArray()
      return corsify(NextResponse.json(list.map(({ _id, ...r }) => r)))
    }

    // Create flow
    if (route === '/flows' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const flow = {
        id: uuidv4(),
        name: body.name || 'Untitled Flow',
        canvasConfigs: body.canvasConfigs || [], // [{ canvasId, sources: { [dynamicKey]: { type:'image'|'text', images?:[], style?:string } } }]
        posts: [],
        status: 'draft', // draft | generating | ready
        createdAt: new Date(),
        updatedAt: new Date(),
      }
      await db.collection('flows').insertOne(flow)
      const { _id, ...rest } = flow
      return corsify(NextResponse.json(rest))
    }

    // Single flow CRUD
    const flowMatch = route.match(/^\/flows\/([^/]+)$/)
    if (flowMatch) {
      const id = flowMatch[1]
      if (method === 'GET') {
        const f = await db.collection('flows').findOne({ id })
        if (!f) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
        const { _id, ...rest } = f
        return corsify(NextResponse.json(rest))
      }
      if (method === 'PUT') {
        const body = await request.json()
        const update = { ...body, id, updatedAt: new Date() }
        delete update._id; delete update.createdAt
        await db.collection('flows').updateOne({ id }, { $set: update })
        const f = await db.collection('flows').findOne({ id })
        const { _id, ...rest } = f || {}
        return corsify(NextResponse.json(rest))
      }
      if (method === 'DELETE') {
        await db.collection('flows').deleteOne({ id })
        return corsify(NextResponse.json({ success: true }))
      }
    }

    // Generate content ideas for a flow (AI brainstorms post angles from brand context)
    const flowIdeasMatch = route.match(/^\/flows\/([^/]+)\/generate-ideas$/)
    if (flowIdeasMatch && method === 'POST') {
      const flowId = flowIdeasMatch[1]
      const body = await request.json().catch(() => ({}))

      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

      // Merge in any brand context the frontend just sent (for freshness before save)
      if (body.brand) flow.brandContext = { ...flow.brandContext, ...body.brand }
      if (body.language) flow.language = body.language

      const groqKey    = process.env.GROQ_API_KEY
      const languageName = LANGUAGE_NAMES[flow.language] || 'English'
      const existingIdeaTexts = (flow.contentIdeas || [])
        .map(i => (typeof i === 'string' ? i : i.text))
        .filter(Boolean)

      const fallbackIdeas = [
        `Share a tip your audience does not know yet`,
        `Show the story behind how your brand started`,
        `Feature a customer success story or testimonial`,
        `Give a behind-the-scenes look at your process`,
        `Challenge a common misconception in your industry`,
        `Highlight your most popular product or service`,
        `Share a quick step-by-step how-to`,
        `Ask your audience an engaging question`,
      ]

      if (!groqKey) return corsify(NextResponse.json({ ideas: fallbackIdeas }))

      const brandProfile = buildBrandProfile(flow)
      const alreadyBlock = existingIdeaTexts.length > 0
        ? `\n## IDEAS ALREADY IN THE LIST (do NOT repeat or paraphrase these):\n${existingIdeaTexts.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n`
        : ''

      const prompt = [
        `You are a senior Instagram content strategist. Generate 8 concrete post angles for this specific brand.`,
        ``,
        brandProfile,
        alreadyBlock,
        `## OUTPUT REQUIREMENTS`,
        `- Return EXACTLY 8 ideas as a JSON array of strings.`,
        `- Each idea is one line, 6-16 words, in ${languageName}, phrased as a concrete post concept the copywriter can execute.`,
        `- Vary the formats aggressively: tip, story, myth-buster, before/after, list, controversial take, contrarian question, behind-the-scenes, mini case study, quick win.`,
        `- Every idea must be specific to THIS brand — reference their product, audience, or strategic insights above where possible.`,
        `- Never use vague filler like "engage with your audience" or "share value".`,
        ``,
        `Return ONLY a valid JSON array: ["Idea 1","Idea 2","Idea 3","Idea 4","Idea 5","Idea 6","Idea 7","Idea 8"]`,
      ].filter(Boolean).join('\n')

      try {
        console.log('🤖 CONTENT IDEAS PROMPT:\n', prompt)
        const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.95, maxTokens: 700 })
        const parsed = extractJson(raw, null)
        const arr = Array.isArray(parsed)
          ? parsed
          : (parsed && Array.isArray(parsed.ideas)) ? parsed.ideas : null
        if (!arr) throw new Error('no JSON array')
        return corsify(NextResponse.json({ ideas: arr.slice(0, 8).map(String) }))
      } catch (e) {
        console.error('Ideas error', e.message)
        return corsify(NextResponse.json({ ideas: fallbackIdeas }))
      }
    }

    // Generate posts for a flow — AI generates all text keys in one Groq call per post
    const flowGenerateMatch = route.match(/^\/flows\/([^/]+)\/generate$/)
    if (flowGenerateMatch && method === 'POST') {
      const flowId = flowGenerateMatch[1]
      const body = await request.json().catch(() => ({}))
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

      const baseUrl  = getBaseUrl(request)
      const brand    = flow.brandContext || {}
      const groqKey  = process.env.GROQ_API_KEY
      // New data model: flow.selectedCanvases (array of ids), flow.galleryId, flow.tone
      const canvasIds    = flow.selectedCanvases || (flow.canvasConfigs || []).map(c => c.canvasId)
      const galleryId    = flow.galleryId || null
      const tone         = flow.tone || 'informative'
      const language     = body.language || flow.language || 'english'  // Get from request body or flow settings
      const carouselChance = body.carouselChance !== undefined ? body.carouselChance : 30  // Get from request or default to 30
      // Selected content ideas (array of {id, text, selected} or plain strings)
      const contentIdeas = (flow.contentIdeas || [])
        .filter(i => i.selected !== false)
        .map(i => (typeof i === 'string' ? i : i.text))
        .filter(Boolean)

      if (canvasIds.length === 0) return corsify(NextResponse.json({ error: 'No canvases selected' }, { status: 400 }))

      // Load gallery images and convert uploads to data URLs
      let galleryImages = []
      if (galleryId) {
        const gallery = await db.collection('galleries').findOne({ id: galleryId })
        if (gallery && gallery.images) {
          // Convert any /api/uploads/{id} URLs to base64 data URLs
          for (const imgUrl of gallery.images) {
            const uploadMatch = imgUrl.match(/\/api\/uploads\/([a-f0-9-]+)/)
            if (uploadMatch) {
              const uploadId = uploadMatch[1]
              try {
                const upload = await db.collection('uploads').findOne({ id: uploadId })
                if (upload && upload.bytes) {
                  const buf = upload.bytes && typeof upload.bytes.value === 'function' ? upload.bytes.value() : Buffer.from(upload.bytes)
                  const base64 = buf.toString('base64')
                  const dataUrl = `data:${upload.contentType || 'image/png'};base64,${base64}`
                  galleryImages.push(dataUrl)
                } else {
                  galleryImages.push(imgUrl) // Fall back to URL if not found
                }
              } catch (e) {
                console.error('Failed to convert upload to data URL:', e.message)
                galleryImages.push(imgUrl) // Fall back to URL
              }
            } else {
              // External URL, use as-is
              galleryImages.push(imgUrl)
            }
          }
        }
      }

      // Consolidated brand profile — single source of truth for AI prompts
      const brandProfile   = buildBrandProfile(flow)
      const recentPostsCtx = buildRecentPostsContext(flow.posts)
      const languageName   = LANGUAGE_NAMES[language] || 'English'
      const toneDesc       = TONE_DESCS[tone] || TONE_DESCS.informative
      const contentIdeasBlock = contentIdeas.length > 0
        ? `\n## POST ANGLES TO USE (rotate through these — one per new post)\n${contentIdeas.map((t, i) => `  ${i + 1}. ${t}`).join('\n')}\n`
        : ''

      // Shared helper: analyze a text node and return word budget + hierarchy hint
      const computeFieldMeta = (allNodes) => (k) => {
        const node = allNodes.find(n => n.dynamic_key === k && n.type === 'text')
        if (!node) return { key: k, hint: 'short text', maxWords: 8, sizeCategory: 'short', role: 'body' }
        const fs = Math.max(12, node.fontSize || 48)
        const w  = Math.max(50, node.width  || 200)
        const h  = Math.max(30, node.height || 100)
        const lineHeight = Math.max(1.0, node.lineHeight || 1.2)
        const fontWidthRatio = fs <= 20 ? 0.54 : fs <= 32 ? 0.53 : fs <= 48 ? 0.52 : 0.51
        const avgCharWidth = fs * fontWidthRatio
        const containerPadding = Math.max(8, fs * 0.15)
        const effectiveWidth = w - (containerPadding * 2)
        const charsPerLine = Math.max(3, Math.floor(effectiveWidth / avgCharWidth))
        const lineSpaceNeeded = fs * lineHeight
        const verticalPadding = Math.max(4, fs * 0.25)
        const effectiveHeight = h - (verticalPadding * 2)
        const availableLines = Math.max(1, Math.floor(effectiveHeight / lineSpaceNeeded))
        const avgCharsPerWord = 5.5
        const maxChars = charsPerLine * availableLines
        let maxWords = Math.max(2, Math.round(maxChars / avgCharsPerWord))
        let sizeCategory = 'medium'
        if (h < 40)      { maxWords = Math.min(maxWords, 4);  sizeCategory = 'micro' }
        else if (h < 80) { maxWords = Math.min(maxWords, 10); sizeCategory = 'short' }
        else if (h < 200){ maxWords = Math.max(8, Math.min(maxWords, 30)); sizeCategory = 'medium' }
        else if (h < 400){ maxWords = Math.max(25, maxWords); sizeCategory = 'large' }
        else             { maxWords = Math.max(50, maxWords); sizeCategory = 'extra-large' }
        const role =
          fs >= 72 ? 'HERO headline' :
          fs >= 48 ? 'headline'      :
          fs >= 30 ? 'sub-headline'  :
          fs >= 20 ? 'body copy'     : 'caption/micro-text'
        return { key: k, hint: `${maxWords} words max (${sizeCategory} — ${role})`, maxWords, sizeCategory, role }
      }

      // Instagram craft principles injected into every generation prompt
      const IG_PRINCIPLES = [
        `## INSTAGRAM CRAFT PRINCIPLES (obey all of these)`,
        `1. HOOK FIRST. The very first line/headline must stop the scroll — pattern break, surprising claim, curiosity gap, or naming the exact reader.`,
        `2. SPECIFIC > VAGUE. Use concrete nouns, numbers, tangible outcomes. Never write filler like "amazing", "next level", "game-changer".`,
        `3. ONE IDEA per post. Do not stuff. Pick a single sharp angle and commit.`,
        `4. WRITE LIKE A HUMAN. Contractions where natural. Short sentences. Direct address ("you").`,
        `5. NO CORPORATE MUSH. Ban words: "unlock", "elevate", "empower", "unleash", "seamless", "revolutionary", "cutting-edge", "solutions", "leverage", "synergy".`,
        `6. NO EMOJIS, NO HASHTAGS in the on-canvas text (they go in the caption instead if any).`,
        `7. RESPECT WORD LIMITS STRICTLY. A field with "6 words max" MUST have ≤ 6 words.`,
      ].join('\n')

      // Unused legacy generator kept as no-op for safety in case anything still references it
      const aiGenerateTextKeys = async () => ({})

      // ── AI: SINGLE IMAGE POST — all copy in one AI call ─────────────
      const aiGenerateTextKeysSingle = async (canvas, textKeys, allNodes, postIndex, idea) => {
        const unique = [...new Set(textKeys)]
        if (unique.length === 0) return {}
        const meta = unique.map(computeFieldMeta(allNodes))
        const layoutDesc = describeCanvasLayout(canvas, allNodes)

        const prompt = [
          `You are a world-class Instagram copywriter. Write the on-canvas text for ONE single-image post.`,
          ``,
          brandProfile,
          ``,
          layoutDesc,
          ``,
          IG_PRINCIPLES,
          contentIdeasBlock,
          recentPostsCtx,
          ``,
          `## THIS POST (post #${postIndex + 1} in the batch)`,
          idea ? `- Angle to execute: "${idea}"` : `- Angle: choose a fresh angle that has NOT been used above.`,
          `- Format: SINGLE image (not a carousel). Everything visible at once. No "swipe", no "next slide", no "part 1".`,
          `- All fields must combine into ONE cohesive story: hook → substance → resolution (or CTA).`,
          ``,
          `## FIELDS TO FILL (name → word budget & role)`,
          meta.map(m => `  • ${m.key} → ${m.hint}`).join('\n'),
          ``,
          `## OUTPUT`,
          `Return ONLY a valid JSON object mapping each field name to its finished text.`,
          `Example shape (values are placeholders, use your own copy in ${languageName}):`,
          `{${meta.map(m => `"${m.key}":"..."`).join(',')}}`,
        ].filter(Boolean).join('\n')

        try {
          const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.9, maxTokens: 600, jsonMode: true })
          const parsed = extractJson(raw, {}) || {}
          const result = {}
          for (const m of meta) {
            const v = parsed[m.key]
            result[m.key] = v && String(v).trim() ? String(v).trim() : 'Something worth stopping for.'
          }
          return result
        } catch (e) {
          console.error('Single-image generation failed:', e.message)
          const result = {}
          for (const m of meta) result[m.key] = 'Something worth stopping for.'
          return result
        }
      }

      // ── AI: CAROUSEL PAGE — one AI call per page ────────────────────
      // pageType: 'top_peer' | 'content' | 'bottom_peer'
      const aiGenerateTextKeysCarouselPage = async (canvas, textKeys, pageNodes, _pageRole, _pageDescription, pageType, totalPages, pageIdx, postIndex, idea, hookContent) => {
        const unique = [...new Set(textKeys)]
        if (unique.length === 0) return {}
        const meta = unique.map(computeFieldMeta(pageNodes))
        const layoutDesc = describeCanvasLayout({ ...canvas, name: `${canvas.name} — page ${pageIdx + 1}/${totalPages}` }, pageNodes)

        // Role-specific directives
        let roleBlock, hookRef = ''
        if (pageType === 'top_peer') {
          roleBlock = [
            `## PAGE ROLE — HOOK (page 1 of ${totalPages})`,
            `- Job: stop the scroll and make people SWIPE. Nothing else.`,
            `- Reveal a curiosity gap, contrarian claim, or naming a pain the reader recognizes.`,
            `- Do NOT list the tips/steps. Tease them. The full value is on the next pages.`,
          ].join('\n')
        } else if (pageType === 'bottom_peer') {
          roleBlock = [
            `## PAGE ROLE — CALL TO ACTION (page ${totalPages} of ${totalPages})`,
            `- Job: convert attention into ONE clear next step.`,
            `- Options: comment a word, save the post, DM a keyword, tap the link, follow, share.`,
            `- Be specific. "Learn more" is banned.`,
          ].join('\n')
          if (hookContent && Object.keys(hookContent).length > 0) {
            hookRef = `\n## HOOK FROM PAGE 1 (tie the CTA back to it)\n${Object.entries(hookContent).map(([k,v]) => `  ${k}: ${v}`).join('\n')}`
          }
        } else {
          roleBlock = [
            `## PAGE ROLE — CONTENT (page ${pageIdx + 1} of ${totalPages})`,
            `- Job: deliver the PROMISE made by page 1. Give the concrete value, proof, or story.`,
            `- Bring NEW information. Do NOT paraphrase the hook.`,
            `- Every sentence has to justify itself. If a sentence adds nothing, cut it.`,
          ].join('\n')
          if (hookContent && Object.keys(hookContent).length > 0) {
            hookRef = `\n## HOOK YOU MUST EXPAND (from page 1)\n${Object.entries(hookContent).map(([k,v]) => `  ${k}: ${v}`).join('\n')}\nYour task: deliver on this promise with fresh, specific content.`
          }
        }

        const prompt = [
          `You are a world-class Instagram carousel copywriter. Write the on-canvas text for ONE page of a carousel.`,
          ``,
          brandProfile,
          ``,
          layoutDesc,
          ``,
          IG_PRINCIPLES,
          contentIdeasBlock,
          recentPostsCtx,
          ``,
          roleBlock,
          hookRef,
          ``,
          `## THIS POST (carousel post #${postIndex + 1} in the batch)`,
          idea ? `- Angle for the whole carousel: "${idea}"` : `- Choose a fresh angle not used above.`,
          ``,
          `## FIELDS TO FILL (name → word budget & role)`,
          meta.map(m => `  • ${m.key} → ${m.hint}`).join('\n'),
          ``,
          `## OUTPUT`,
          `Return ONLY a valid JSON object mapping each field name to its finished text (in ${languageName}).`,
          `Example: {${meta.map(m => `"${m.key}":"..."`).join(',')}}`,
        ].filter(Boolean).join('\n')

        try {
          const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.9, maxTokens: 550, jsonMode: true })
          const parsed = extractJson(raw, {}) || {}
          const result = {}
          for (const m of meta) {
            const v = parsed[m.key]
            result[m.key] = v && String(v).trim() ? String(v).trim() : (pageType === 'top_peer' ? 'The one thing everyone gets wrong' : pageType === 'bottom_peer' ? 'Save this for later' : 'Here is what actually works')
          }
          return result
        } catch (e) {
          console.error('Carousel page generation failed:', e.message)
          const result = {}
          for (const m of meta) result[m.key] = pageType === 'top_peer' ? 'The one thing everyone gets wrong' : pageType === 'bottom_peer' ? 'Save this for later' : 'Here is what actually works'
          return result
        }
      }

      // ── AI: INSTAGRAM CAPTION ───────────────────────────────────────
      const generateCaption = async (textValues, _brand, _tone, _groqKey) => {
        const contentSummary = Object.entries(textValues || {})
          .filter(([, v]) => typeof v === 'string' && v.length > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')

        const prompt = [
          `You are writing the Instagram CAPTION that will accompany a post whose on-image copy is already written.`,
          ``,
          brandProfile,
          ``,
          `## ON-IMAGE COPY (already written — the caption must complement, NOT repeat, it)`,
          contentSummary,
          ``,
          `## RULES`,
          `- Language: ${languageName} only.`,
          `- 1 to 3 sentences (max ~220 characters total).`,
          `- Open with a hook different from the image headline.`,
          `- End with a soft CTA (comment / save / share) OR a punchy line — depending on tone.`,
          `- No hashtags, no emojis, no quotes around the caption.`,
          `- Return the caption text ONLY, no preamble.`,
        ].join('\n')

        try {
          const caption = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.85, maxTokens: 160 })
          // Strip accidental wrapping quotes
          return caption.replace(/^["']|["']$/g, '').trim() || 'Worth a second look.'
        } catch (e) {
          console.error('Caption generation error:', e.message)
          return flow?.brandContext?.businessName ? `New from ${flow.brandContext.businessName}.` : 'Worth a second look.'
        }
      }




      // ── AI GENERATE FOR CAROUSEL PAGES ──
      // Generate content specifically for each carousel page (supports N pages)

      // Render a canvas with given data
      const renderOnePost = async (canvas, renderData) => {
        const renderId = uuidv4()
        try {
          if (canvas.type === 'carousel') {
            const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
            const zip = new JSZip()
            for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
              const page = pages[pageIdx]
              
              // Build page-specific renderData by filtering keys with correct suffix
              let pd = {}
              if (page.type === 'top_peer') {
                // For top_peer pages, extract keys ending with _top
                for (const [k, v] of Object.entries(renderData)) {
                  if (k.endsWith('_top')) pd[k.replace('_top', '')] = v
                }
              } else if (page.type === 'bottom_peer') {
                // For bottom_peer pages, extract keys ending with _bottom
                for (const [k, v] of Object.entries(renderData)) {
                  if (k.endsWith('_bottom')) pd[k.replace('_bottom', '')] = v
                }
              } else {
                // For content pages, extract keys with matching content index
                const contentIdx = pages.filter(p => p.type === 'content').indexOf(page)
                const suffix = `_${contentIdx + 1}`
                for (const [k, v] of Object.entries(renderData)) {
                  if (k.endsWith(suffix)) pd[k.replace(suffix, '')] = v
                }
              }
              
              const pc = { ...canvas, nodes: page.nodes || [], groups: page.groups || [], classes: page.classes || {} }
              const png = await renderCanvasToPng(pc, pd)
              const lbl = page.type === 'top_peer' ? '00-top-peer' : page.type === 'bottom_peer' ? `${String(pageIdx).padStart(2,'0')}-bottom-peer` : `${String(pageIdx).padStart(2,'0')}-${(page.name||'page').replace(/\s+/g,'-')}`
              zip.file(`${lbl}.png`, png)
            }
            const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
            await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'carousel', zip: new Binary(zipBuf), payload: renderData, approved: false, createdAt: new Date() })
            return { url: `${baseUrl}/api/rendered/${renderId}.zip`, render_id: renderId, type: 'carousel' }
          } else {
            const png = await renderCanvasToPng(canvas, renderData)
            await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'single', png: new Binary(png), payload: renderData, approved: false, createdAt: new Date() })
            return { url: `${baseUrl}/api/rendered/${renderId}`, render_id: renderId, type: 'single' }
          }
        } catch (e) { console.error('render error', e.message); return null }
      }

      // ── Randomize function: Configurable chance to be carousel ──
      const randomizePostType = (hasCarousels, hasSingles, chance = 30) => {
        // If only one type available, return that
        if (hasCarousels && !hasSingles) return 'carousel'
        if (!hasCarousels && hasSingles) return 'single'
        if (!hasCarousels && !hasSingles) return null
        
        // Both types available: use the provided chance (percentage)
        return Math.random() * 100 < chance ? 'carousel' : 'single'
      }

      // ── Generate 3 posts, randomizing canvas selection ──
      const posts = []
      
      // Build a map of canvases for quick lookup and type checking
      const canvasMap = new Map()
      for (const cid of canvasIds) {
        const c = await db.collection('canvases').findOne({ id: cid })
        if (c) canvasMap.set(cid, c)
      }
      
      // Separate canvas IDs by type
      const singleCanvasIds = canvasIds.filter(id => canvasMap.get(id)?.type !== 'carousel')
      const carouselCanvasIds = canvasIds.filter(id => canvasMap.get(id)?.type === 'carousel')
      const hasCarousels = carouselCanvasIds.length > 0
      const hasSingles = singleCanvasIds.length > 0

      for (let i = 0; i < 3; i++) {
        // STEP 1: Randomly decide if this post should be carousel or single (based on carousel chance)
        const postType = randomizePostType(hasCarousels, hasSingles, carouselChance)
        if (!postType) continue
        
        // STEP 2: Select appropriate canvas based on post type decision
        const selectedIds = postType === 'carousel' ? carouselCanvasIds : singleCanvasIds
        if (selectedIds.length === 0) continue
        
        const canvasId = selectedIds[Math.floor(Math.random() * selectedIds.length)]
        const canvas = canvasMap.get(canvasId)
        if (!canvas) continue

        // STEP 3: Get the content idea for this post (different handling for carousel vs single)
        const idea = contentIdeas.length > 0 ? contentIdeas[i % contentIdeas.length] : null

        // STEP 4: Generate content based on post type (SINGLE vs CAROUSEL)
        let textValues = {}
        let imageValues = {}

        if (postType === 'carousel') {
          // ── CAROUSEL: Generate unique content for each page (N pages) ──
          // Each page has different strategic purpose and dynamic keys
          // Content flows: Hook → Supporting Details → CTA (but handles any number of pages)
          
          // Get carousel pages (can be any number)
          const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
          const renderData = {} // { key_top: val, key_1: val, key_bottom: val, ... }
          let hookContent = null // Will store the hook to inform other pages
          
          // Identify page types and positions
          const topPeerPageIdx = pages.findIndex(p => p.type === 'top_peer')
          const bottomPeerPageIdx = pages.findIndex(p => p.type === 'bottom_peer')
          const contentPageIndices = pages.map((p, idx) => (p.type === 'content' ? idx : -1)).filter(idx => idx !== -1)
          
          // PHASE 1: Generate top_peer (hook) first if it exists
          if (topPeerPageIdx >= 0) {
            const topPeerPage = pages[topPeerPageIdx]
            const topPeerNodes = topPeerPage.nodes || []
            const topPeerTextKeys = topPeerNodes.filter(n => n.dynamic_key && n.type === 'text').map(n => n.dynamic_key)
            
            if (topPeerTextKeys.length > 0) {
              hookContent = await aiGenerateTextKeysCarouselPage(
                canvas,
                topPeerTextKeys,
                topPeerNodes,
                'TOP PEER (Hook Page)',
                'First impression - hook the viewer and make them want to swipe',
                'top_peer',
                pages.length,
                topPeerPageIdx,
                i,
                idea,
                null // No hook reference for top peer
              )
              
              // Store hook content with top_peer suffix
              for (const [k, v] of Object.entries(hookContent)) {
                renderData[`${k}_top`] = v
              }
            }
            
            // Add images for top_peer
            const topPeerImageKeys = [...new Set(topPeerNodes.filter(n => n.dynamic_key && n.type === 'image').map(n => n.dynamic_key))]
            for (const key of topPeerImageKeys) {
              if (galleryImages.length > 0) {
                const img = galleryImages[Math.floor(Math.random() * galleryImages.length)]
                renderData[`${key}_top`] = img
              }
            }
          }
          
          // PHASE 2: Generate middle content pages (with hook reference if hook exists)
          for (const pageIdx of contentPageIndices) {
            const page = pages[pageIdx]
            const pageNodes = page.nodes || []
            const pageTextKeys = pageNodes.filter(n => n.dynamic_key && n.type === 'text').map(n => n.dynamic_key)
            
            if (pageTextKeys.length > 0) {
              // Describe this content page's role and reference the hook
              const contentPageNum = contentPageIndices.indexOf(pageIdx) + 1
              const contentPagesCount = contentPageIndices.length
              
              let pageDescription = ''
              if (contentPagesCount === 1) {
                // Only one content page
                if (hookContent) {
                  pageDescription = 'Expand on the hook with supporting details, proof, or examples.'
                } else {
                  pageDescription = 'Main content - provide detailed information and value.'
                }
              } else if (contentPageNum === 1) {
                // First content page
                if (hookContent) {
                  pageDescription = 'Expand and explain the hook from the first page. Provide proof, details, or supporting evidence.'
                } else {
                  pageDescription = 'First detailed content - build on the introduction.'
                }
              } else if (contentPageNum === contentPagesCount) {
                // Last content page before CTA
                pageDescription = 'Final content. Reinforce the message and prepare for action.'
              } else {
                // Middle content pages
                pageDescription = 'Continue building the narrative. Provide additional value or proof.'
              }
              
              const pageTextValues = await aiGenerateTextKeysCarouselPage(
                canvas,
                pageTextKeys,
                pageNodes,
                `CONTENT PAGE ${contentPageNum} OF ${contentPagesCount}`,
                pageDescription,
                'content',
                pages.length,
                pageIdx,
                i,
                idea,
                hookContent // Pass hook to middle pages so they can reference it
              )
              
              // Apply content page suffix
              const contentIdx = contentPageIndices.indexOf(pageIdx)
              for (const [k, v] of Object.entries(pageTextValues)) {
                renderData[`${k}_${contentIdx + 1}`] = v
              }
              
              // VALIDATION: Check if this page is just repeating the hook
              if (hookContent) {
                const hookStr = Object.values(hookContent).join(' ').toLowerCase()
                const pageStr = Object.values(pageTextValues).join(' ').toLowerCase()
                
                // Check for key phrase repetition (indicates poor expansion)
                const hookWords = hookStr.split(/\s+/).slice(0, 8) // First 8 words of hook
                const repeatCount = hookWords.filter(w => w.length > 3 && pageStr.includes(w)).length
                
                if (repeatCount > 4) {
                  // This middle page is repeating the hook too much
                  console.warn(`Carousel page ${contentIdx + 1} rejected: Repeating hook instead of expanding (${repeatCount} keyword matches)`)
                  // Remove this page from renderData since it failed validation
                  for (const k of pageTextKeys) {
                    delete renderData[`${k}_${contentIdx + 1}`]
                  }
                  // Regenerate this page
                  const retryTextValues = await aiGenerateTextKeysCarouselPage(
                    canvas,
                    pageTextKeys,
                    pageNodes,
                    `CONTENT PAGE ${contentPageNum} OF ${contentPagesCount} (RETRY)`,
                    'Expand further on the hook. Provide NEW details, examples, or evidence NOT mentioned before. Go deeper.',
                    'content',
                    pages.length,
                    pageIdx,
                    i,
                    idea,
                    hookContent
                  )
                  // Add retry results
                  for (const [k, v] of Object.entries(retryTextValues)) {
                    renderData[`${k}_${contentIdx + 1}`] = v
                  }
                }
              }
            }
            
            // Add images for content page
            const pageImageKeys = [...new Set(pageNodes.filter(n => n.dynamic_key && n.type === 'image').map(n => n.dynamic_key))]
            for (const key of pageImageKeys) {
              if (galleryImages.length > 0) {
                const img = galleryImages[Math.floor(Math.random() * galleryImages.length)]
                const contentIdx = contentPageIndices.indexOf(pageIdx)
                renderData[`${key}_${contentIdx + 1}`] = img
              }
            }
          }
          
          // PHASE 3: Generate bottom_peer (CTA) last if it exists
          if (bottomPeerPageIdx >= 0) {
            const bottomPeerPage = pages[bottomPeerPageIdx]
            const bottomPeerNodes = bottomPeerPage.nodes || []
            const bottomPeerTextKeys = bottomPeerNodes.filter(n => n.dynamic_key && n.type === 'text').map(n => n.dynamic_key)
            
            if (bottomPeerTextKeys.length > 0) {
              const ctaContent = await aiGenerateTextKeysCarouselPage(
                canvas,
                bottomPeerTextKeys,
                bottomPeerNodes,
                'BOTTOM PEER (CTA Page)',
                'Final page - drive action or create curiosity for next series',
                'bottom_peer',
                pages.length,
                bottomPeerPageIdx,
                i,
                idea,
                hookContent // Pass hook so CTA can reference it if needed
              )
              
              // Store CTA content with bottom_peer suffix
              for (const [k, v] of Object.entries(ctaContent)) {
                renderData[`${k}_bottom`] = v
              }
            }
            
            // Add images for bottom_peer
            const bottomPeerImageKeys = [...new Set(bottomPeerNodes.filter(n => n.dynamic_key && n.type === 'image').map(n => n.dynamic_key))]
            for (const key of bottomPeerImageKeys) {
              if (galleryImages.length > 0) {
                const img = galleryImages[Math.floor(Math.random() * galleryImages.length)]
                renderData[`${key}_bottom`] = img
              }
            }
          }
          
          // Render carousel
          const renderResult = await renderOnePost(canvas, renderData)
          
          // Generate Instagram caption from carousel content (extract text values from renderData)
          const carouselTextValues = {}
          for (const [k, v] of Object.entries(renderData)) {
            if (typeof v === 'string' && !v.startsWith('http') && !k.match(/_\d+$/) && !k.endsWith('_top') && !k.endsWith('_bottom')) {
              carouselTextValues[k] = v
            }
          }
          const captionText = await generateCaption(carouselTextValues, brand, tone, groqKey)
          
          posts.push({ id: uuidv4(), canvasId: canvas.id, canvasName: canvas.name, canvasType: 'carousel', data: renderData, caption: captionText, render: renderResult, status: 'pending', scheduledAt: null, createdAt: new Date() })
          
        } else {
          // ── SINGLE IMAGE: Generate content optimized just for the single image ──
          // This is independent, complete story in ONE image
          
          // Get all dynamic keys from the single canvas
          const allNodes = [...(canvas.nodes || []), ...(canvas.pages || []).flatMap(p => p.nodes || [])]
          const textKeys = allNodes.filter(n => n.dynamic_key && n.type === 'text').map(n => n.dynamic_key)
          const imageKeys = [...new Set(allNodes.filter(n => n.dynamic_key && n.type === 'image').map(n => n.dynamic_key))]
          
          // Generate text content optimized for single image (complete story in one visual)
          if (textKeys.length > 0) {
            textValues = await aiGenerateTextKeysSingle(canvas, textKeys, allNodes, i, idea)
          }
          
          // Pick random images
          for (const key of imageKeys) {
            if (galleryImages.length > 0) imageValues[key] = galleryImages[Math.floor(Math.random() * galleryImages.length)]
          }
          
          const renderData = { ...textValues, ...imageValues }
          
          // Render single
          const renderResult = await renderOnePost(canvas, renderData)
          
          // VALIDATION: Check if single image got carousel-style content
          const contentStr = Object.values(textValues).join(' ').toLowerCase()
          const carouselPatterns = [
            /\d+\s+(tips?|steps?|ways?|reasons?|tricks?|hacks?)/i,
            /here'?s\s+\d+/i,
            /follow\s+for\s+more/i,
            /swipe\s+(up|for|to|left|right)/i,
            /next\s+(page|slide|step)/i,
            /part\s+\d+/i,
            /series\s+\d+/i,
          ]
          
          let hasCarouselContent = carouselPatterns.some(pattern => pattern.test(contentStr))
          
          if (hasCarouselContent) {
            // Reject this single post - it has carousel content, regenerate
            console.warn(`Single image #${i+1} rejected: Contains carousel-style content (${contentStr.substring(0, 60)}...)`)
            continue // Skip this post, don't add it
          }
          
          // Generate Instagram caption from content
          const captionText = await generateCaption(textValues, brand, tone, groqKey)
          
          posts.push({ id: uuidv4(), canvasId: canvas.id, canvasName: canvas.name, canvasType: 'single', data: renderData, caption: captionText, render: renderResult, status: 'pending', scheduledAt: null, createdAt: new Date() })
        }
      }

      // Append new posts to existing posts instead of replacing
      // IMPORTANT: Don't store full renderData in DB - it makes the document too large (>16MB MongoDB limit)
      // Only store post metadata and IDs
      const postsForDB = posts.map(p => ({
        id: p.id,
        canvasId: p.canvasId,
        canvasName: p.canvasName,
        canvasType: p.canvasType,
        caption: p.caption,
        render: p.render,
        status: p.status,
        scheduledAt: p.scheduledAt,
        createdAt: p.createdAt,
        // DO NOT store: data (renderData) - it's too large and not needed for display
      }))
      
      await db.collection('flows').updateOne({ id: flowId }, { $push: { posts: { $each: postsForDB } }, $set: { status: 'ready', updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true, postCount: posts.length, posts: postsForDB }))
    }

    // Update a single post inside a flow (accept/reject/schedule)
    const flowPostMatch = route.match(/^\/flows\/([^/]+)\/posts\/([^/]+)$/)
    if (flowPostMatch && method === 'PATCH') {
      const [, flowId, postId] = flowPostMatch
      const body = await request.json().catch(() => ({}))
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
      
      // Only update safe fields - don't store large renderData
      const safeUpdateFields = ['status', 'scheduledAt', 'caption']
      const updateData = {}
      for (const field of safeUpdateFields) {
        if (body.hasOwnProperty(field)) {
          updateData[field] = body[field]
        }
      }
      
      const posts = (flow.posts || []).map(p => p.id === postId ? { ...p, ...updateData } : p)
      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true }))
    }

    // Re-render a single post with updated data
    const rerenderMatch = route.match(/^\/flows\/([^/]+)\/rerender-post$/)
    if (rerenderMatch && method === 'POST') {
      const flowId = rerenderMatch[1]
      const { postId, data: newData } = await request.json().catch(() => ({}))
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
      const post = (flow.posts || []).find(p => p.id === postId)
      if (!post) return corsify(NextResponse.json({ error: 'Post not found' }, { status: 404 }))
      const canvas = await db.collection('canvases').findOne({ id: post.canvasId })
      if (!canvas) return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))

      const baseUrl = getBaseUrl(request)
      const renderId = uuidv4()
      let renderResult = null
      try {
        if (canvas.type === 'carousel') {
          const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
          const zip = new JSZip()
          for (const page of pages) {
            let pd = { ...newData }
            if (page.type === 'top_peer') for (const [k, v] of Object.entries(newData)) pd[`${k}_top`] = v
            else if (page.type === 'bottom_peer') for (const [k, v] of Object.entries(newData)) pd[`${k}_bottom`] = v
            const pageCanvas = { ...canvas, nodes: page.nodes || [], groups: page.groups || [], classes: page.classes || {} }
            const png = await renderCanvasToPng(pageCanvas, pd)
            const label = page.type === 'top_peer' ? '00-top-peer' : page.type === 'bottom_peer' ? `${String(pages.indexOf(page)).padStart(2,'0')}-bottom-peer` : `${String(pages.indexOf(page)).padStart(2,'0')}-${(page.name||'page').replace(/\s+/g,'-')}`
            zip.file(`${label}.png`, png)
          }
          const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
          await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'carousel', zip: new Binary(zipBuf), payload: newData, approved: false, createdAt: new Date() })
          renderResult = { url: `${baseUrl}/api/rendered/${renderId}.zip`, render_id: renderId, type: 'carousel' }
        } else {
          const png = await renderCanvasToPng(canvas, newData)
          await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'single', png: new Binary(png), payload: newData, approved: false, createdAt: new Date() })
          renderResult = { url: `${baseUrl}/api/rendered/${renderId}`, render_id: renderId, type: 'single' }
        }
      } catch (e) { 
        console.error('rerender error', e.message)
        return corsify(NextResponse.json({ success: false, error: 'Failed to render post' }, { status: 400 }))
      }

      // Update post with new render - ONLY store render URL, not the data
      const posts = (flow.posts || []).map(p => p.id === postId ? { ...p, render: renderResult, updatedAt: new Date() } : p)
      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true }))
    }

    // AI copy generation endpoint (used by edit post dialog)
    if (route === '/ai-copy' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { key, topic, brandContext, tone, classContext } = body
      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        return corsify(NextResponse.json({ text: `${topic || 'Your product'} — worth another look.` }))
      }
      const prompt = [
        `You are a senior Instagram copywriter.`,
        brandContext && `## BRAND CONTEXT\n${brandContext}`,
        `## TASK`,
        `Rewrite ONE short piece of on-canvas text (the field "${key}"${topic ? `, angle: "${topic}"` : ''}).`,
        `Tone: ${TONE_DESCS[tone] || TONE_DESCS.informative}`,
        classContext && `## STYLE HINT\n${classContext}`,
        `## RULES`,
        `- Max 15 words.`,
        `- No hashtags, no emojis, no wrapping quotes, no preamble.`,
        `- Return the finished text ONLY.`,
      ].filter(Boolean).join('\n')
      try {
        const text = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.9, maxTokens: 120 })
        return corsify(NextResponse.json({ text: (text || '').replace(/^["']|["']$/g, '').trim() || `${topic || key} — worth another look.` }))
      } catch (_e) {
        return corsify(NextResponse.json({ text: `${topic || key} — worth another look.` }))
      }
    }

    // Website Context: Fetch and summarize website content
    if (route === '/website-context' && method === 'POST') {
      const { url } = await request.json().catch(() => ({}))
      if (!url || typeof url !== 'string') {
        return corsify(NextResponse.json({ error: 'url is required' }, { status: 400 }))
      }

      // Validate URL format
      let parsedUrl
      try {
        parsedUrl = new URL(url)
      } catch (e) {
        return corsify(NextResponse.json({ error: 'Invalid URL format' }, { status: 400 }))
      }

      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        return corsify(NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 }))
      }

      try {
        // Fetch website content
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        })

        if (!response.ok) {
          return corsify(NextResponse.json({ error: `Failed to fetch URL (${response.status})` }, { status: 400 }))
        }

        const html = await response.text()

        // Simple HTML text extraction (remove script, style tags and extract text)
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (!textContent || textContent.length < 50) {
          return corsify(NextResponse.json({ error: 'Could not extract meaningful content from URL' }, { status: 400 }))
        }

        // Limit to first 3000 characters for API efficiency
        const contentForAI = textContent.substring(0, 3000)

        // Call Groq to generate 120-word summary
        const cleanContent = contentForAI.substring(0, 2500).replace(/\n/g, ' ').replace(/\s+/g, ' ')
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: `Summarize this website (120 words): ${cleanContent}` }],
            max_tokens: 200,
            temperature: 0.7
          })
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          console.error('Groq website context error:', { status: res.status, error: errData })
          throw new Error(`Groq API error: ${res.status} - ${errData.error?.message || 'Unknown'}`)
        }

        const aiData = await res.json()
        const summary = aiData.choices?.[0]?.message?.content?.trim() || 'Unable to generate summary'

        return corsify(NextResponse.json({ 
          summary, 
          sourceUrl: url,
          charCount: contentForAI.length,
          createdAt: new Date()
        }))
      } catch (e) {
        console.error('Website context error:', e.message)
        return corsify(NextResponse.json({ error: `Failed to process URL: ${e.message}` }, { status: 400 }))
      }
    }

    // Generate strategic brand questions from context
    if (route === '/generate-brand-questions' && method === 'POST') {
      const { brandContext } = await request.json().catch(() => ({}))
      if (!brandContext) {
        return corsify(NextResponse.json({ error: 'brandContext is required', success: false }, { status: 400 }))
      }

      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        return corsify(NextResponse.json({ error: 'Groq API key not configured', success: false }, { status: 500 }))
      }

      try {
        const prompt = [
          `You are a senior brand strategist. Your job: extract the INSIDER KNOWLEDGE we need to write killer Instagram posts for this brand — things that are NOT already on the website.`,
          ``,
          `## WHAT WE ALREADY KNOW (from the website)`,
          brandContext,
          ``,
          `## YOUR TASK`,
          `Generate EXACTLY 5 short, punchy questions the brand owner can answer in one sentence each.`,
          `Each question should unlock content angles that would be impossible to write without insider input.`,
          ``,
          `## RULES`,
          `- 5 questions total.`,
          `- Each one is a maximum of ~14 words, ends with a "?".`,
          `- Cover 5 different areas: (1) the ONE product/service they want to sell most right now,`,
          `  (2) the customer's biggest pain or frustration, (3) a widespread myth or mistake in their niche,`,
          `  (4) what makes them irreplaceable vs competitors, (5) one quick actionable tip they can teach.`,
          `- No corporate jargon in the questions. No "please describe...".`,
          `- Return ONLY a JSON array of 5 strings. No preamble.`,
          ``,
          `Example shape (do NOT copy content, invent yours based on the context above):`,
          `["Which offer do you want to sell more of right now?","What frustrates your customers most before they find you?","What myth in your industry do you love breaking?","Why do customers pick you over your closest competitor?","What quick tip could you teach in one sentence?"]`,
        ].join('\n')

        console.log('🤖 BRAND QUESTIONS PROMPT:\n', prompt)
        const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.7, maxTokens: 400 })
        let questions = []
        const parsed = extractJson(raw, null)
        if (Array.isArray(parsed)) questions = parsed
        else if (parsed && Array.isArray(parsed.questions)) questions = parsed.questions
        questions = questions.filter(q => typeof q === 'string' && q.trim()).slice(0, 5)

        if (questions.length < 5) {
          const fallback = [
            'Which offer do you want to sell more of right now?',
            'What frustrates your ideal customer before they find you?',
            'What myth in your industry do you love breaking?',
            'Why do customers pick you over your closest competitor?',
            'What quick tip could you teach in one sentence?',
          ]
          for (const q of fallback) if (questions.length < 5 && !questions.includes(q)) questions.push(q)
        }

        return corsify(NextResponse.json({ success: true, questions: questions.slice(0, 5) }))
      } catch (e) {
        console.error('Brand questions generation error:', e.message)
        return corsify(NextResponse.json({ 
          error: `Failed to generate questions: ${e.message}`,
          success: false
        }, { status: 400 }))
      }
    }

    // Extract brand information from website
    if (route === '/extract-brand-info' && method === 'POST') {
      const { url } = await request.json().catch(() => ({}))
      if (!url || typeof url !== 'string') {
        return corsify(NextResponse.json({ error: 'url is required' }, { status: 400 }))
      }

      // Validate URL format
      let parsedUrl
      try {
        parsedUrl = new URL(url)
      } catch (e) {
        return corsify(NextResponse.json({ error: 'Invalid URL format' }, { status: 400 }))
      }

      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        return corsify(NextResponse.json({ error: 'Groq API key not configured' }, { status: 500 }))
      }

      try {
        // Fetch website content
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        })

        if (!response.ok) {
          return corsify(NextResponse.json({ 
            businessName: '',
            description: '',
            targetAudience: '',
            brandVoice: '',
            extra: '',
            error: `Failed to fetch URL (${response.status})`
          }))
        }

        const html = await response.text()

        // Extract meta / og / twitter / json-ld before stripping tags
        const grabMeta = (name) => {
          const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*content=["']([^"']+)["']`, 'i')
          const m = html.match(re)
          return m ? m[1].trim() : ''
        }
        const grabAltMeta = (name) => {
          const re = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:name|property)=["']${name}["']`, 'i')
          const m = html.match(re)
          return m ? m[1].trim() : ''
        }
        const metaTitle = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim()
        const metaDesc  = grabMeta('description') || grabAltMeta('description') || grabMeta('og:description') || grabMeta('twitter:description')
        const ogSite    = grabMeta('og:site_name')
        const ogTitle   = grabMeta('og:title')
        const h1Match   = (html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        // Extract JSON-LD organization data if present
        let jsonLdBlock = ''
        const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
        let ldMatch
        while ((ldMatch = jsonLdRegex.exec(html)) !== null) {
          try {
            const parsed = JSON.parse(ldMatch[1].trim())
            const items = Array.isArray(parsed) ? parsed : (parsed['@graph'] || [parsed])
            for (const it of items) {
              if (it && (it['@type'] === 'Organization' || it['@type'] === 'LocalBusiness' || it['@type'] === 'WebSite' || it['@type'] === 'Person')) {
                jsonLdBlock += `${it['@type']}: name="${it.name || ''}", description="${it.description || ''}"; `
              }
            }
          } catch (_e) { /* ignore malformed json-ld */ }
        }

        // Extract text content (fallback signal)
        const textContent = html
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        if (!textContent || textContent.length < 50) {
          return corsify(NextResponse.json({ 
            businessName: '',
            description: '',
            targetAudience: '',
            brandVoice: '',
            extra: '',
            error: 'Could not extract meaningful content from URL'
          }))
        }

        // Limit content for API efficiency
        const contentForAI = textContent.substring(0, 4000)

        // Feed the AI a well-structured input (meta tags first — they're the highest-signal source)
        const structuredInput = [
          metaTitle && `PAGE TITLE: ${metaTitle}`,
          ogSite    && `SITE NAME: ${ogSite}`,
          ogTitle   && `OG TITLE: ${ogTitle}`,
          metaDesc  && `META DESCRIPTION: ${metaDesc}`,
          h1Match   && `MAIN HEADING (H1): ${h1Match}`,
          jsonLdBlock && `STRUCTURED DATA: ${jsonLdBlock}`,
          `\nBODY TEXT (excerpt):\n${contentForAI.substring(0, 2800).replace(/\n/g, ' ').replace(/\s+/g, ' ')}`,
        ].filter(Boolean).join('\n')

        const extractPrompt = [
          `You are analysing a business website. Extract the brand information a copywriter needs.`,
          ``,
          `## RAW SIGNALS FROM THE PAGE`,
          structuredInput,
          ``,
          `## OUTPUT`,
          `Return ONLY valid JSON with EXACTLY these fields (use empty string "" only if the signal is truly absent):`,
          `{`,
          `  "businessName": "The business/brand name",`,
          `  "description": "2-3 rich sentences: what they do, for whom, and what they are known for. Be specific, name products/services.",`,
          `  "targetAudience": "One sentence — who they serve, ideally with demographic or need-based specificity.",`,
          `  "brandVoice": "One phrase describing the personality (e.g. 'confident, no-nonsense, direct') based on how they write.",`,
          `  "extra": "Any other useful nuance: pricing model, geography, unique angle, brand story."`,
          `}`,
          `No preamble, no code fences, JSON ONLY.`,
        ].join('\n')


        console.log('🤖 BRAND EXTRACTION PROMPT (len):', extractPrompt.length)
        let responseText = ''
        try {
          responseText = await callGroq({ prompt: extractPrompt, model: MODEL_MAIN, temperature: 0.3, maxTokens: 500, jsonMode: true })
        } catch (e) {
          console.error('Groq brand extraction error:', e.message)
          throw new Error(`Groq API error: ${e.message}`)
        }
        
        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/)
        let brandInfo = {
          businessName: '',
          description: '',
          targetAudience: '',
          brandVoice: '',
          extra: ''
        }

        if (jsonMatch) {
          try {
            const parsed = JSON.parse(jsonMatch[0])
            // Only keep non-empty values
            brandInfo.businessName = (parsed.businessName || '').trim()
            brandInfo.description = (parsed.description || '').trim()
            brandInfo.targetAudience = (parsed.targetAudience || '').trim()
            brandInfo.brandVoice = (parsed.brandVoice || '').trim()
            brandInfo.extra = (parsed.extra || '').trim()
          } catch (e) {
            console.error('JSON parse error:', e.message)
          }
        }

        // Check if any useful information was extracted
        const hasUsefulInfo = brandInfo.businessName || brandInfo.description || brandInfo.targetAudience || brandInfo.brandVoice || brandInfo.extra
        
        if (!hasUsefulInfo) {
          return corsify(NextResponse.json({ 
            businessName: '',
            description: '',
            targetAudience: '',
            brandVoice: '',
            extra: '',
            info: 'No business information found on this website. Please fill in the details manually or try a different URL.',
            sourceUrl: url,
            timestamp: new Date()
          }, { status: 200 }))
        }

        return corsify(NextResponse.json({ 
          ...brandInfo,
          sourceUrl: url,
          timestamp: new Date()
        }))
      } catch (e) {
        console.error('Brand extraction error:', e.message)
        return corsify(NextResponse.json({ 
          businessName: '',
          description: '',
          targetAudience: '',
          brandVoice: '',
          extra: '',
          error: `Failed to process URL: ${e.message}`
        }, { status: 400 }))
      }
    }

    // Re-render a single post with new data
    const flowRerenderMatch = route.match(/^\/flows\/([^/]+)\/rerender-post$/)
    if (flowRerenderMatch && method === 'POST') {
      const flowId = flowRerenderMatch[1]
      const { postId, data: newData } = await request.json().catch(() => ({}))
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
      const post = (flow.posts || []).find(p => p.id === postId)
      if (!post) return corsify(NextResponse.json({ error: 'Post not found' }, { status: 404 }))
      const canvas = await db.collection('canvases').findOne({ id: post.canvasId })
      if (!canvas) return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))

      const baseUrl = getBaseUrl(request)
      const renderId = uuidv4()
      let renderResult = null
      try {
        if (canvas.type === 'carousel') {
          const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
          const zip = new JSZip()
          for (const page of pages) {
            let pd = { ...newData }
            if (page.type === 'top_peer') for (const [k, v] of Object.entries(newData)) pd[`${k}_top`] = v
            else if (page.type === 'bottom_peer') for (const [k, v] of Object.entries(newData)) pd[`${k}_bottom`] = v
            const pageCanvas = { ...canvas, nodes: page.nodes || [], groups: page.groups || [], classes: page.classes || {} }
            const png = await renderCanvasToPng(pageCanvas, pd)
            const label = page.type === 'top_peer' ? '00-top-peer' : page.type === 'bottom_peer' ? `${String(pages.indexOf(page)).padStart(2,'0')}-bottom-peer` : `${String(pages.indexOf(page)).padStart(2,'0')}-${(page.name||'page').replace(/\s+/g,'-')}`
            zip.file(`${label}.png`, png)
          }
          const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
          await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'carousel', zip: new Binary(zipBuf), payload: newData, approved: false, createdAt: new Date() })
          renderResult = { url: `${baseUrl}/api/rendered/${renderId}.zip`, render_id: renderId, type: 'carousel' }
        } else {
          const png = await renderCanvasToPng(canvas, newData)
          await db.collection('renders').insertOne({ id: renderId, canvasId: canvas.id, type: 'single', png: new Binary(png), payload: newData, approved: false, createdAt: new Date() })
          renderResult = { url: `${baseUrl}/api/rendered/${renderId}`, render_id: renderId, type: 'single' }
        }
      } catch (e) { console.error('rerender error', e.message) }

      const posts = (flow.posts || []).map(p => p.id === postId ? { ...p, data: newData, render: renderResult } : p)
      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
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
