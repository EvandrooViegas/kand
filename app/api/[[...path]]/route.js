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
      const language = body.language || 'english'
      
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

      const brand = flow.brandContext || {}
      const tone  = flow.tone || 'informative'
      const groqKey = process.env.GROQ_API_KEY

      const brandCtx = [
        brand.businessName && `Business: ${brand.businessName}`,
        brand.description  && `About: ${brand.description}`,
        brand.audience     && `Audience: ${brand.audience}`,
        brand.voice        && `Voice: ${brand.voice}`,
        brand.extra        && `Extra context: ${brand.extra}`,
      ].filter(Boolean).join('. ')

      const LANGUAGE_MAP = {
        english: 'English',
        spanish: 'Spanish',
        french: 'French',
        german: 'German',
        italian: 'Italian',
        portuguese: 'Portuguese',
        dutch: 'Dutch',
        polish: 'Polish',
        swedish: 'Swedish',
        russian: 'Russian',
        japanese: 'Japanese',
        chinese: 'Chinese (Simplified)',
        korean: 'Korean',
        arabic: 'Arabic',
      }

      const TONE_LABELS = {
        informative: 'educational and informative',
        helpful:     'warm, helpful and practical',
        aggressive:  'bold, urgent and FOMO-driven',
        inspiring:   'inspiring and aspirational',
        playful:     'playful, fun and conversational',
      }

      const fallbackIdeas = [
        'Share a tip your audience doesn\'t know yet',
        'Show the story behind how your brand started',
        'Feature a customer success story or testimonial',
        'Give a behind-the-scenes look at your process',
        'Challenge a common misconception in your industry',
        'Highlight your most popular product or service',
        'Share a quick step-by-step how-to',
        'Ask your audience an engaging question',
      ]

      if (!groqKey) return corsify(NextResponse.json({ ideas: fallbackIdeas }))

      const languageName = LANGUAGE_MAP[language] || 'English'
      const prompt = [
        `You are a social media content strategist.`,
        `Brand: ${brandCtx || 'A modern brand looking to grow on Instagram.'}`,
        `Output language: ${languageName}`,
        ``,
        `Generate 8 unique, specific, and actionable content ideas for Instagram posts.`,
        `Each idea is a short content angle or post concept — max 15 words, written as a concrete action (e.g. "Share 3 mistakes beginners make in X").`,
        `Tone: ${TONE_LABELS[tone] || TONE_LABELS.informative}.`,
        `Vary the formats: tips, stories, showcases, questions, behind-the-scenes, challenges, how-tos, etc.`,
        `ALL ideas MUST be written in ${languageName} ONLY.`,
        ``,
        'Return ONLY a valid JSON array of 8 strings: ["Idea one","Idea two",...]',
      ].join('\n')

      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 450, temperature: 0.9 }),
        })
        if (!res.ok) throw new Error(`Groq ${res.status}`)
        const aiData = await res.json()
        const raw = aiData.choices?.[0]?.message?.content?.trim() || '[]'
        const m = raw.match(/\[[\s\S]*\]/)
        if (!m) throw new Error('no JSON array')
        const parsed = JSON.parse(m[0])
        return corsify(NextResponse.json({ ideas: Array.isArray(parsed) ? parsed.slice(0, 8).map(String) : fallbackIdeas }))
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

      // Brand context string
      const brandCtx = [
        brand.businessName && `Business: ${brand.businessName}`,
        brand.description  && `About: ${brand.description}`,
        brand.audience     && `Audience: ${brand.audience}`,
        brand.voice        && `Voice: ${brand.voice}`,
        brand.instagram    && `Instagram: @${brand.instagram}`,
        brand.extra        && `Extra context: ${brand.extra}`,
      ].filter(Boolean).join('. ')

      const TONE_DESCS = {
        informative: 'Clear, factual, educational — share a useful insight.',
        helpful:     'Warm, empathetic, solution-focused — offer practical help.',
        aggressive:  'Bold, urgent, FOMO-driven — challenge the reader to act now.',
        inspiring:   'Motivational, aspirational, emotional — ignite a desire to change.',
        playful:     'Fun, witty, conversational — light-hearted and engaging.',
      }
      const toneDesc = TONE_DESCS[tone] || TONE_DESCS.informative

      const LANGUAGE_MAP = {
        english: 'English',
        spanish: 'Spanish',
        french: 'French',
        german: 'German',
        italian: 'Italian',
        portuguese: 'Portuguese',
        dutch: 'Dutch',
        polish: 'Polish',
        swedish: 'Swedish',
        russian: 'Russian',
        japanese: 'Japanese',
        chinese: 'Chinese (Simplified)',
        korean: 'Korean',
        arabic: 'Arabic',
      }
      const languageName = LANGUAGE_MAP[language] || 'English'

      // Ask Groq to fill ALL text keys for one post in a single call
      const aiGenerateTextKeys = async (canvas, textKeys, allNodes, postIndex, idea = null, isCarousel = false) => {
        if (textKeys.length === 0) return {}
        const unique = [...new Set(textKeys)]
        const classNames = Object.keys(canvas.classes || {})
        const classCtx = classNames.length
          ? `\nCanvas styling classes: ${classNames.join(', ')}. For maximum impact you MAY wrap one key phrase per field using <%kind:.classname:phrase%> syntax.`
          : ''

        // Build per-field size hints using DEEP intelligent canvas analysis reasoning
        const fieldMeta = unique.map(k => {
          const node = allNodes.find(n => n.dynamic_key === k && n.type === 'text')
          if (!node) return { key: k, hint: '(short text)', maxWords: 8, sizeCategory: 'short' }
          
          // Extract canvas measurements with fallback safety
          const fs = Math.max(12, node.fontSize || 48)
          const w  = Math.max(50, node.width  || 200)
          const h  = Math.max(30, node.height || 100)
          const lineHeight = Math.max(1.0, node.lineHeight || 1.2)
          
          // ═══════════════════════════════════════════════════════════════════════
          // DEEP CANVAS REASONING: The AI analyzes the actual canvas code to determine
          // optimal text length using multi-layered reasoning
          // ═══════════════════════════════════════════════════════════════════════
          
          // LAYER 1: PIXEL-LEVEL ANALYSIS
          // ─────────────────────────────
          // Analyze font rendering characteristics specific to the Inter font
          // (which is what the canvases use, as seen in renderCanvas.js)
          // Inter is a highly optimized variable font with excellent readability
          const fontWidthRatio = fs <= 20 ? 0.54 : fs <= 32 ? 0.53 : fs <= 48 ? 0.52 : 0.51
          // At smaller sizes, characters are relatively wider; at larger sizes, they're narrower
          const avgCharWidth = fs * fontWidthRatio
          
          // Account for padding within the text container (designer typically leaves 8-16px padding)
          const containerPadding = Math.max(8, fs * 0.15)
          const effectiveWidth = w - (containerPadding * 2)
          const charsPerLine = Math.max(3, Math.floor(effectiveWidth / avgCharWidth))
          
          // LAYER 2: VERTICAL SPACE ANALYSIS
          // ─────────────────────────────────
          // Calculate how many lines can physically fit
          // line-height multiplier tells us spacing: 1.2 = 120% of font size
          const lineSpaceNeeded = fs * lineHeight
          
          // Account for top/bottom padding (typically 0.3-0.5x height in design systems)
          const verticalPadding = Math.max(4, fs * 0.25)
          const effectiveHeight = h - (verticalPadding * 2)
          const availableLines = Math.max(1, Math.floor(effectiveHeight / lineSpaceNeeded))
          
          // LAYER 3: TEXT WRAPPING BEHAVIOR ANALYSIS
          // ──────────────────────────────────────────
          // Different word lengths wrap differently. Use average word metrics:
          // - English average word: 4.7 chars
          // - Social media (shorter, punchier): 5.5 chars
          // - Professional content: 6.2 chars
          // Use 5.5 as it's optimized for Instagram/social (the primary use case)
          const avgCharsPerWord = 5.5
          const maxChars = charsPerLine * availableLines
          const maxWords = Math.max(2, Math.round(maxChars / avgCharsPerWord))
          
          // LAYER 4: VISUAL HIERARCHY & DESIGN INTENT DETECTION
          // ──────────────────────────────────────────────────
          // The SIZE of a field tells us its PURPOSE in the design hierarchy
          let adjustedMaxWords = maxWords
          let hierarchyIndicator = 'standard'
          
          // MICRO TEXT (very constrained): < 40px tall
          // These are high-impact focal points — headlines, CTAs, single powerful statements
          if (h < 40) {
            adjustedMaxWords = Math.min(maxWords, 4)
            hierarchyIndicator = 'micro (visual anchor)'
            // For micro fields, even if calculated words = 6, cap at 4 for punchy impact
          }
          // SHORT TEXT (moderately constrained): 40-80px
          // Usually supporting headlines or first hook lines — need to be memorable
          else if (h < 80) {
            adjustedMaxWords = Math.min(maxWords, 10)
            hierarchyIndicator = 'short (supporting hook)'
          }
          // MEDIUM TEXT (balanced): 80-200px
          // Standard body text, descriptions, context — has room for ideas but not essays
          else if (h < 200) {
            hierarchyIndicator = 'medium (body content)'
            // Use calculated value but cap extreme outliers
            adjustedMaxWords = Math.max(8, Math.min(maxWords, 30))
          }
          // LARGE TEXT (expansive): 200-400px
          // Longer narrative space for storytelling, testimonials, detailed explanations
          else if (h < 400) {
            hierarchyIndicator = 'large (narrative space)'
            adjustedMaxWords = Math.max(25, maxWords)
          }
          // EXTRA LARGE TEXT (expansive prose): > 400px
          // Full paragraph territory — can develop arguments, tell stories
          else {
            hierarchyIndicator = 'extra-large (full narrative)'
            adjustedMaxWords = Math.max(50, maxWords)
          }
          
          // LAYER 5: FONT SIZE REASONING
          // ──────────────────────────────
          // Larger fonts = typically more important + fewer words fit
          // Smaller fonts = typically supporting + more words can fit
          let fontSizeReasoning = ''
          if (fs >= 48) fontSizeReasoning = 'large font (48px+) emphasizes visual dominance'
          else if (fs >= 32) fontSizeReasoning = 'medium font (32px) balances prominence and space'
          else if (fs >= 24) fontSizeReasoning = 'small font (24px) allows more content'
          else fontSizeReasoning = 'tiny font (<24px) requires brevity or scrolling'
          
          // LAYER 6: CATEGORIZE BY VISUAL IMPACT
          // ─────────────────────────────────────
          let sizeCategory = 'medium'
          if (adjustedMaxWords <= 4) sizeCategory = 'micro'
          else if (adjustedMaxWords <= 10) sizeCategory = 'short'
          else if (adjustedMaxWords <= 25) sizeCategory = 'medium'
          else if (adjustedMaxWords <= 50) sizeCategory = 'long'
          else sizeCategory = 'extra-long'
          
          // LAYER 7: INFER SEMANTIC ROLE FROM FIELD NAME
          // ──────────────────────────────────────────────
          const fieldNameLower = k.toLowerCase()
          let purposeHint = ''
          let fieldRole = 'content'
          let semanticContext = ''
          
          if (fieldNameLower.match(/^(title|headline|heading|main|primary)$/i) || 
              fieldNameLower.includes('headline') || fieldNameLower.includes('heading')) {
            purposeHint = '. HEADLINE — make it bold, attention-grabbing, high-impact'
            fieldRole = 'headline'
            semanticContext = 'Your primary message hook. This field is the visual hero.'
          } else if (fieldNameLower.match(/^(subtitle|description|desc|context|detail|supporting)$/i) || 
                     fieldNameLower.includes('subtitle') || fieldNameLower.includes('description')) {
            purposeHint = '. SUPPORTING TEXT — provide context, intrigue, narrative depth'
            fieldRole = 'subtitle'
            semanticContext = 'Secondary information that builds on the headline.'
          } else if (fieldNameLower.match(/^(cta|call|button|action|click|tap)$/i) || 
                     fieldNameLower.includes('cta') || fieldNameLower.includes('button')) {
            purposeHint = '. CALL-TO-ACTION — urgent, action-oriented, must compel clicking'
            fieldRole = 'cta'
            semanticContext = 'Drives conversion. Use power verbs: "Get," "Join," "Start," "Learn."'
          } else if (fieldNameLower.match(/^(hook|intro|preview|open|first)$/i) || 
                     fieldNameLower.includes('hook') || fieldNameLower.includes('intro')) {
            purposeHint = '. SCROLL-STOP HOOK — stop the infinite scroll immediately'
            fieldRole = 'hook'
            semanticContext = 'Make them stop swiping and read the next field.'
          } else if (fieldNameLower.match(/^(caption|byline|footer|credit)$/i) || 
                     fieldNameLower.includes('caption')) {
            purposeHint = '. CAPTION TEXT — brief, supporting, secondary'
            fieldRole = 'caption'
            semanticContext = 'Provides attribution or light context.'
          } else if (fieldNameLower.includes('benefit') || fieldNameLower.includes('value') || fieldNameLower.includes('result')) {
            purposeHint = '. BENEFIT STATEMENT — articulate why the user should care'
            fieldRole = 'benefit'
            semanticContext = 'Focus on outcome, not features.'
          }
          
          // LAYER 8: VISUAL LAYOUT POSITION INFERENCE
          // ────────────────────────────────────────
          // Position in the canvas (x, y) can hint at reading order
          // Top fields = seen first (usually more important)
          // Bottom fields = CTA or reinforcement
          let positionContext = ''
          if (node.y < canvas.height * 0.3) positionContext = 'top of design (primary focal point)'
          else if (node.y > canvas.height * 0.7) positionContext = 'bottom of design (CTA or reinforcement)'
          else positionContext = 'middle of design (supporting content)'
          
          // FINAL: Build comprehensive hint with multi-layer analysis
          const hint = `${adjustedMaxWords} word${adjustedMaxWords !== 1 ? 's' : ''} max (${sizeCategory}${purposeHint})`
          
          return { 
            key: k, 
            hint, 
            maxWords: adjustedMaxWords,
            sizeCategory,
            fieldRole,
            fs,
            w,
            h,
            charsPerLine,
            availableLines,
            hierarchyIndicator,
            fontSizeReasoning,
            semanticContext,
            positionContext,
            originalCalc: maxWords,
            avgCharWidth,
            effectiveWidth,
            effectiveHeight,
            lineSpaceNeeded
          }
        })

        // Include the actual canvas JSON so the AI can see and reason about the real structure
        const canvasJson = JSON.stringify({
          name: canvas.name,
          type: canvas.type,
          width: canvas.width,
          height: canvas.height,
          background: canvas.background,
          nodes: allNodes.map(n => ({
            id: n.id,
            type: n.type,
            dynamic_key: n.dynamic_key,
            x: n.x,
            y: n.y,
            width: n.width,
            height: n.height,
            fontSize: n.fontSize,
            fontFamily: n.fontFamily,
            fontWeight: n.fontWeight,
            lineHeight: n.lineHeight,
            textAlign: n.textAlign,
            color: n.color,
            text: n.text
          }))
        }, null, 2)

        const prompt = [
          `You are an expert social media copywriter.`,
          `Canvas: "${canvas.name}" | Brand: ${brand.businessName || 'Our brand'} | Tone: ${toneDesc}`,
          `${isCarousel ? 'CAROUSEL POST (3-page structure)' : 'SINGLE IMAGE POST'}`,
          `Post #${postIndex + 1}${idea ? ` — Focus: "${idea}"` : ' — Make this meaningfully different from previous posts'}`,
          ``,
          isCarousel ? [
            `CAROUSEL STRUCTURE GUIDE:`,
            `This is a 3-page carousel. Each page has a specific strategic purpose:`,
            ``,
            `1. TOP PEER (Hook Page - First Impression):`,
            `   • GOAL: Stop viewers immediately. Make them want to swipe to next page.`,
            `   • STRATEGY: Hook with curiosity, surprise, or emotional trigger.`,
            `   • Content: Usually has "hook" or "headline" fields - make it POWERFUL.`,
            `   • Examples: "Wait for page 2..." | "This changed everything" | "You've been doing it wrong"`,
            ``,
            `2. CONTENT PAGES (Middle Pages - The Message):`,
            `   • GOAL: Deliver the main message, explain the hook, provide value.`,
            `   • STRATEGY: Continuation and expansion of top peer hook.`,
            `   • Content: Usually has "description", "benefits", "explanation" fields.`,
            `   • This is where the story unfolds and proof/details are provided.`,
            ``,
            `3. BOTTOM PEER (CTA/Continuation Page - The Ask):`,
            `   • GOAL: Drive action or create curiosity for follow-up content.`,
            `   • STRATEGY: Strong call-to-action or hook for next series.`,
            `   • Content: Usually has "cta" or "hook" fields - must be action-oriented.`,
            `   • Examples: "Follow for part 2" | "Comment your biggest challenge" | "DM for details"`,
            ``,
            `KEY INSIGHT: The three pages tell ONE cohesive story:`,
            `  Page 1 (Hook) → Page 2 (Substance) → Page 3 (Action)`,
            `  Make sure each page makes viewers want to swipe next.`,
            ``
          ].join('\n') : `SINGLE IMAGE POST:\nGOAL: Tell complete story in one visual. All key info in one field.`,
          ``,
          `TEXT FIELDS (field name: max words | role):`,
          fieldMeta.map(({ key, hint, fieldRole }) => `  • ${key}: ${hint} | Role: ${fieldRole}`).join('\n'),
          ``,
          `RULES:`,
          `1. Respect word limits strictly`,
          `2. Each post must be unique (different angle, benefit, or tone)`,
          `3. Match depth to field size: large fields = more narrative, small fields = power words`,
          `4. All fields tell one cohesive story`,
          `5. Plain text only (no hashtags, emojis, special chars)`,
          isCarousel ? `6. Remember: Page 1 hooks → Page 2 explains → Page 3 calls to action` : '',
          ``,
          `CANVAS STRUCTURE:`,
          `\`\`\`json`,
          canvasJson,
          `\`\`\``,
          ``,
          `Generate ONLY valid JSON: {"fieldname":"text","another":"text"}`,
        ].filter(Boolean).join('\n')

        if (!groqKey) {
          // Fallback without API key - generate smart fallbacks by field type
          const result = {}
          for (const field of fieldMeta) {
            if (field.fieldRole === 'headline') result[field.key] = 'Discover Our Solution'
            else if (field.fieldRole === 'cta') result[field.key] = 'Learn More'
            else if (field.fieldRole === 'hook') result[field.key] = 'Stop scrolling'
            else if (field.fieldRole === 'subtitle') result[field.key] = 'See what makes us different'
            else result[field.key] = 'Explore now'
          }
          return result
        }

        // Retry logic with exponential backoff for reliability
        let lastError = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
              body: JSON.stringify({ 
                model: 'llama-3.1-8b-instant', 
                messages: [{ role: 'user', content: prompt }], 
                max_tokens: 500, 
                temperature: 0.85 + (attempt * 0.05) // Slightly increase temperature on retries for variation
              }),
            })
            if (!res.ok) {
              lastError = new Error(`Groq ${res.status}`)
              if (res.status === 429) {
                // Rate limited - wait and retry with exponential backoff
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
                continue
              }
              throw lastError
            }
            const aiData = await res.json()
            const raw = aiData.choices?.[0]?.message?.content?.trim() || '{}'
            const m = raw.match(/\{[\s\S]*\}/)
            if (!m) throw new Error('no JSON in response')
            const parsed = JSON.parse(m[0])
            const result = {}
            for (const k of unique) {
              const val = parsed[k]
              if (val && String(val).trim()) {
                result[k] = String(val)
              } else {
                // Fallback for missing fields - generate smart default by role
                const field = fieldMeta.find(f => f.key === k)
                if (field?.fieldRole === 'headline') result[k] = 'Discover Our Solution'
                else if (field?.fieldRole === 'cta') result[k] = 'Learn More'
                else if (field?.fieldRole === 'hook') result[k] = 'Stop scrolling'
                else if (field?.fieldRole === 'subtitle') result[k] = 'See what makes us different'
                else result[k] = 'Explore now'
              }
            }
            return result
          } catch (e) {
            lastError = e
            if (attempt < 2) {
              // Wait before retrying (exponential backoff)
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
            }
          }
        }

        console.error('Groq error after 3 attempts:', lastError?.message)
        // Final fallback - generate unique fallbacks per field based on their roles
        const result = {}
        for (const field of fieldMeta) {
          if (field.fieldRole === 'headline') result[field.key] = 'Discover Our Solution'
          else if (field.fieldRole === 'cta') result[field.key] = 'Learn More'
          else if (field.fieldRole === 'hook') result[field.key] = 'Stop scrolling'
          else if (field.fieldRole === 'subtitle') result[field.key] = 'See what makes us different'
          else result[field.key] = 'Explore now'
        }
        return result
      }


      // ── AI GENERATE FOR CAROUSEL PAGES ──
      // Generate content specifically for each carousel page (supports N pages)
      const aiGenerateTextKeysCarouselPage = async (canvas, textKeys, pageNodes, pageRole, pageDescription, pageType, totalPages, pageIdx, postIndex, idea, hookContent) => {
        if (textKeys.length === 0) return {}
        const unique = [...new Set(textKeys)]
        const classNames = Object.keys(canvas.classes || {})
        const classCtx = classNames.length
          ? `\nCanvas styling classes: ${classNames.join(', ')}. For maximum impact you MAY wrap one key phrase per field using <%kind:.classname:phrase%> syntax.`
          : ''

        // Build field metadata for this specific page
        const fieldMeta = unique.map(k => {
          const node = pageNodes.find(n => n.dynamic_key === k && n.type === 'text')
          if (!node) return { key: k, hint: '(short text)', maxWords: 8, sizeCategory: 'short' }
          
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
          
          // Size category determination
          let sizeCategory = 'medium'
          if (h < 40) {
            maxWords = Math.min(maxWords, 4)
            sizeCategory = 'micro'
          } else if (h < 80) {
            maxWords = Math.min(maxWords, 10)
            sizeCategory = 'short'
          } else if (h < 200) {
            sizeCategory = 'medium'
            maxWords = Math.max(8, Math.min(maxWords, 30))
          } else if (h < 400) {
            sizeCategory = 'large'
            maxWords = Math.max(25, maxWords)
          } else {
            sizeCategory = 'extra-large'
            maxWords = Math.max(50, maxWords)
          }
          
          // Detect field role from name
          let fieldRole = 'body'
          const lowerKey = k.toLowerCase()
          if (lowerKey.includes('headline') || lowerKey.includes('title') || lowerKey.includes('heading')) fieldRole = 'headline'
          else if (lowerKey.includes('hook') || lowerKey.includes('catch')) fieldRole = 'hook'
          else if (lowerKey.includes('cta') || lowerKey.includes('action') || lowerKey.includes('button')) fieldRole = 'cta'
          else if (lowerKey.includes('subtitle') || lowerKey.includes('description')) fieldRole = 'subtitle'
          
          const hint = `${maxWords} word${maxWords !== 1 ? 's' : ''} max (${sizeCategory})`
          return { 
            key: k, 
            hint, 
            maxWords,
            sizeCategory,
            fieldRole
          }
        })

        // Build page-specific prompt with dynamic page context
        let roleContext = ''
        let hookReference = ''
        
        if (pageType === 'top_peer') {
          roleContext = [
            `YOUR ROLE: Hook the viewer. Make them WANT to swipe to the next page.`,
            `STRATEGY: Use curiosity, surprise, or emotional trigger. Stop them mid-scroll.`,
            `TONE: Bold, attention-grabbing, creates desire to see what's next.`,
            `CONTENT: Fields here should tease the main message without revealing everything.`,
            ``
          ].join('\n')
        } else if (pageType === 'bottom_peer') {
          roleContext = [
            `YOUR ROLE: Drive action or create curiosity for follow-up.`,
            `STRATEGY: Strong call-to-action or hook for next series/content.`,
            `TONE: Clear instruction, urgency, compelling reason to act now.`,
            `CONTENT: Fields here should motivate viewers to take the next step.`,
            ``
          ].join('\n')
          
          // If we have hook content, reference it in the CTA
          if (hookContent && Object.keys(hookContent).length > 0) {
            hookReference = `\nREFERENCE FROM PAGE 1:\nHook message: ${Object.values(hookContent).join(' - ')}\nYour CTA should tie back to this hook and drive action on it.`
          }
        } else if (pageType === 'content') {
          roleContext = [
            `YOUR ROLE: Support and expand on the hook from page 1.`,
            `STRATEGY: Deliver proof, details, examples, or evidence that support the hook's promise.`,
            `TONE: Informative, detailed, builds credibility and momentum toward the CTA.`,
            `CONTENT: Fields here provide substance, examples, or proof for the hook.`,
            ``
          ].join('\n')
          
          // If we have hook content, reference it
          if (hookContent && Object.keys(hookContent).length > 0) {
            hookReference = `\nHOOK FROM PAGE 1:\n${Object.values(hookContent).join(' ')}\n\nYour job: Provide evidence, examples, or details that SUPPORT and EXPAND on this hook. Everything you write should directly relate to and strengthen the hook message.`
          }
        }

        let pagePrompt
        
        if (pageType === 'top_peer') {
          pagePrompt = [
            `You are an expert social media copywriter. Creating PAGE 1 of a ${totalPages}-page carousel.`,
            `Language: Write EVERYTHING in ${languageName} ONLY. Do not use any other language.`,
            `Brand: ${brand.businessName || 'Our brand'} | Tone: ${toneDesc}`,
            `Post #${postIndex + 1}${idea ? ` — Focus: "${idea}"` : ''}`,
            ``,
            `PAGE 1 ROLE: THE HOOK - Make viewers STOP and WANT to swipe.`,
            `${roleContext}`,
            ``,
            `CRITICAL: This is the HOOK page. You MUST:`,
            `  1. Ask a question OR make a bold statement that creates curiosity`,
            `  2. Make viewers want to see page 2 to learn more`,
            `  3. Do NOT provide the full answer here - save that for page 2`,
            `  4. Do NOT list "steps" or "tips" in detail - hint at them instead`,
            ``,
            `TEXT FIELDS (field name: max words | role):`,
            fieldMeta.map(({ key, hint, fieldRole }) => `  • ${key}: ${hint} | Role: ${fieldRole}`).join('\n'),
            ``,
            `RULES:`,
            `1. Respect word limits strictly`,
            `2. Intrigue, don't educate`,
            `3. Plain text only (no hashtags, emojis, special chars)`,
            `4. Make page 1 a question or teaser, NOT the full answer`,
            `5. WRITE EVERYTHING IN ${languageName.toUpperCase()}`,
            ``,
            `Generate ONLY valid JSON: {"fieldname":"text","another":"text"}`,
          ].filter(Boolean).join('\n')
        } else if (pageType === 'content') {
          pagePrompt = [
            `You are an expert social media copywriter. Creating CONTENT PAGE of a ${totalPages}-page carousel.`,
            `Language: Write EVERYTHING in ${languageName} ONLY. Do not use any other language.`,
            `Brand: ${brand.businessName || 'Our brand'} | Tone: ${toneDesc}`,
            `Post #${postIndex + 1}${idea ? ` — Focus: "${idea}"` : ''}`,
            ``,
            `PAGE ${pageIdx + 1} ROLE: SUPPORT AND EXPAND THE HOOK.`,
            `${roleContext}`,
            hookReference,
            ``,
            `CRITICAL INSTRUCTIONS FOR THIS CONTENT PAGE:`,
            `  • You MUST directly expand on and support the hook from page 1`,
            `  • Do NOT repeat what was said on page 1 - add NEW supporting information`,
            `  • Provide proof, examples, detailed explanation, or evidence`,
            `  • Make this page feel like the natural continuation after page 1`,
            `  • Do NOT introduce new hooks or separate topics`,
            ``,
            `TEXT FIELDS (field name: max words | role):`,
            fieldMeta.map(({ key, hint, fieldRole }) => `  • ${key}: ${hint} | Role: ${fieldRole}`).join('\n'),
            ``,
            `RULES:`,
            `1. Respect word limits strictly`,
            `2. Educate and provide VALUE that supports page 1's hook`,
            `3. Plain text only (no hashtags, emojis, special chars)`,
            `4. This page MUST feel connected to the hook - don't go off-topic`,
            `5. WRITE EVERYTHING IN ${languageName.toUpperCase()}`,
            ``,
            `Generate ONLY valid JSON: {"fieldname":"text","another":"text"}`,
          ].filter(Boolean).join('\n')
        } else if (pageType === 'bottom_peer') {
          pagePrompt = [
            `You are an expert social media copywriter. Creating PAGE ${totalPages} (FINAL CTA) of a ${totalPages}-page carousel.`,
            `Language: Write EVERYTHING in ${languageName} ONLY. Do not use any other language.`,
            `Brand: ${brand.businessName || 'Our brand'} | Tone: ${toneDesc}`,
            `Post #${postIndex + 1}${idea ? ` — Focus: "${idea}"` : ''}`,
            ``,
            `PAGE ${totalPages} ROLE: FINAL CALL-TO-ACTION tied to the hook.`,
            `${roleContext}`,
            hookReference,
            ``,
            `CRITICAL INSTRUCTIONS FOR THIS CTA PAGE:`,
            `  • This is the FINAL page - viewers have read all content`,
            `  • Direct them to take action related to the hook`,
            `  • Make it clear what they should do NEXT`,
            `  • Create urgency or compelling reason to act NOW`,
            `  • Reference the hook/topic to tie everything together`,
            ``,
            `TEXT FIELDS (field name: max words | role):`,
            fieldMeta.map(({ key, hint, fieldRole }) => `  • ${key}: ${hint} | Role: ${fieldRole}`).join('\n'),
            ``,
            `RULES:`,
            `1. Respect word limits strictly`,
            `2. Be clear and actionable`,
            `3. Plain text only (no hashtags, emojis, special chars)`,
            `4. End with a compelling reason to act`,
            `5. WRITE EVERYTHING IN ${languageName.toUpperCase()}`,
            ``,
            `Generate ONLY valid JSON: {"fieldname":"text","another":"text"}`,
          ].filter(Boolean).join('\n')
        }

        if (!groqKey) {
          // Fallback
          const result = {}
          for (const field of fieldMeta) {
            if (field.fieldRole === 'headline') {
              if (pageType === 'top_peer') result[field.key] = 'Unlock the secret'
              else if (pageType === 'bottom_peer') result[field.key] = 'Ready to start?'
              else result[field.key] = 'Here\'s what matters'
            }
            else if (field.fieldRole === 'cta') {
              if (pageType === 'bottom_peer') result[field.key] = 'Take action now'
              else result[field.key] = 'Learn more'
            }
            else if (field.fieldRole === 'hook') {
              if (pageType === 'top_peer') result[field.key] = 'Wait for page 2'
              else result[field.key] = 'Follow for details'
            }
            else result[field.key] = 'Discover now'
          }
          return result
        }

        // Retry logic
        let lastError = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
              body: JSON.stringify({ 
                model: 'llama-3.1-8b-instant', 
                messages: [{ role: 'user', content: pagePrompt }], 
                max_tokens: 400, 
                temperature: 0.85 + (attempt * 0.05)
              }),
            })
            if (!res.ok) {
              lastError = new Error(`Groq ${res.status}`)
              if (res.status === 429) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
                continue
              }
              throw lastError
            }
            const aiData = await res.json()
            const raw = aiData.choices?.[0]?.message?.content?.trim() || '{}'
            const m = raw.match(/\{[\s\S]*\}/)
            if (!m) throw new Error('no JSON in response')
            const parsed = JSON.parse(m[0])
            const result = {}
            for (const k of unique) {
              const val = parsed[k]
              if (val && String(val).trim()) {
                result[k] = String(val)
              } else {
                const field = fieldMeta.find(f => f.key === k)
                if (field?.fieldRole === 'headline') {
                  if (pageType === 'top_peer') result[k] = 'Unlock the secret'
                  else if (pageType === 'bottom_peer') result[k] = 'Ready to start?'
                  else result[k] = 'Here\'s what matters'
                }
                else if (field?.fieldRole === 'cta') {
                  if (pageType === 'bottom_peer') result[k] = 'Take action now'
                  else result[k] = 'Learn more'
                }
                else if (field?.fieldRole === 'hook') {
                  if (pageType === 'top_peer') result[k] = 'Wait for page 2'
                  else result[k] = 'Follow for details'
                }
                else result[k] = 'Discover now'
              }
            }
            return result
          } catch (e) {
            lastError = e
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
            }
          }
        }
        console.error('Carousel page generation error:', lastError?.message)
        const result = {}
        for (const field of fieldMeta) {
          if (field.fieldRole === 'headline') {
            if (pageType === 'top_peer') result[field.key] = 'Unlock the secret'
            else if (pageType === 'bottom_peer') result[field.key] = 'Ready to start?'
            else result[field.key] = 'Here\'s what matters'
          }
          else if (field.fieldRole === 'cta') {
            if (pageType === 'bottom_peer') result[field.key] = 'Take action now'
            else result[field.key] = 'Learn more'
          }
          else if (field.fieldRole === 'hook') {
            if (pageType === 'top_peer') result[field.key] = 'Wait for page 2'
            else result[field.key] = 'Follow for details'
          }
          else result[field.key] = 'Discover now'
        }
        return result
      }

      // ── AI GENERATE FOR SINGLE IMAGE ──
      // Generate content optimized for a single image (complete story in one visual)
      const aiGenerateTextKeysSingle = async (canvas, textKeys, allNodes, postIndex, idea) => {
        if (textKeys.length === 0) return {}
        const unique = [...new Set(textKeys)]
        const classNames = Object.keys(canvas.classes || {})
        const classCtx = classNames.length
          ? `\nCanvas styling classes: ${classNames.join(', ')}. For maximum impact you MAY wrap one key phrase per field using <%kind:.classname:phrase%> syntax.`
          : ''

        // Build field metadata
        const fieldMeta = unique.map(k => {
          const node = allNodes.find(n => n.dynamic_key === k && n.type === 'text')
          if (!node) return { key: k, hint: '(short text)', maxWords: 8, sizeCategory: 'short' }
          
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
          if (h < 40) {
            maxWords = Math.min(maxWords, 4)
            sizeCategory = 'micro'
          } else if (h < 80) {
            maxWords = Math.min(maxWords, 10)
            sizeCategory = 'short'
          } else if (h < 200) {
            sizeCategory = 'medium'
            maxWords = Math.max(8, Math.min(maxWords, 30))
          } else if (h < 400) {
            sizeCategory = 'large'
            maxWords = Math.max(25, maxWords)
          } else {
            sizeCategory = 'extra-large'
            maxWords = Math.max(50, maxWords)
          }
          
          let fieldRole = 'body'
          const lowerKey = k.toLowerCase()
          if (lowerKey.includes('headline') || lowerKey.includes('title') || lowerKey.includes('heading')) fieldRole = 'headline'
          else if (lowerKey.includes('hook') || lowerKey.includes('catch')) fieldRole = 'hook'
          else if (lowerKey.includes('cta') || lowerKey.includes('action') || lowerKey.includes('button')) fieldRole = 'cta'
          else if (lowerKey.includes('subtitle') || lowerKey.includes('description')) fieldRole = 'subtitle'
          
          const hint = `${maxWords} word${maxWords !== 1 ? 's' : ''} max (${sizeCategory})`
          return { 
            key: k, 
            hint, 
            maxWords,
            sizeCategory,
            fieldRole
          }
        })

        // Build single-image-optimized prompt
        const singlePrompt = [
          `You are an expert social media copywriter creating a complete single-image post.`,
          `Language: Write EVERYTHING in ${languageName} ONLY. Do not use any other language.`,
          `Brand: ${brand.businessName || 'Our brand'} | Tone: ${toneDesc}`,
          `Post #${postIndex + 1}${idea ? ` — Focus: "${idea}"` : ' — Make this unique and compelling'}`,
          ``,
          `SINGLE IMAGE POST (NOT A CAROUSEL):`,
          `You have ONE chance to tell the complete story. All content must fit together in one visual to:`,
          `  1. Stop the viewer immediately`,
          `  2. Communicate the key message clearly`,
          `  3. Drive action or curiosity`,
          ``,
          `CRITICAL - THIS IS NOT A CAROUSEL:`,
          `  • Do NOT write content meant for multiple pages`,
          `  • Do NOT mention "3 tips", "5 steps", "here's how", "follow for more"`,
          `  • Do NOT create series-style content (like "Part 1", "next page", etc)`,
          `  • Everything must be COMPLETE and STANDALONE on this ONE image`,
          `  • This is a single complete thought, not a series setup`,
          ``,
          `Strategy: Headline/hook → complete explanation → clear CTA, all SELF-CONTAINED on one visual.`,
          ``,
          `TEXT FIELDS (field name: max words | role):`,
          fieldMeta.map(({ key, hint, fieldRole }) => `  • ${key}: ${hint} | Role: ${fieldRole}`).join('\n'),
          ``,
          `RULES:`,
          `1. Respect word limits strictly`,
          `2. All fields must tell ONE complete, self-contained story`,
          `3. Headline should grab attention immediately`,
          `4. Supporting text provides context, proof, or complete explanation`,
          `5. CTA drives clear action (if present)`,
          `6. Plain text only (no hashtags, emojis, special chars)`,
          `7. NEVER suggest "read more on next slide" or "swipe for part 2"`,
          `8. This is one complete post - viewers see EVERYTHING on this image alone`,
          `9. WRITE EVERYTHING IN ${languageName.toUpperCase()}`,
          ``,
          `Generate ONLY valid JSON: {"fieldname":"text","another":"text"}`,
        ].filter(Boolean).join('\n')

        if (!groqKey) {
          // Fallback
          const result = {}
          for (const field of fieldMeta) {
            if (field.fieldRole === 'headline') result[field.key] = 'Discover what\'s next'
            else if (field.fieldRole === 'cta') result[field.key] = 'Learn more today'
            else if (field.fieldRole === 'hook') result[field.key] = 'This changes everything'
            else result[field.key] = 'Explore the possibilities'
          }
          return result
        }

        // Retry logic
        let lastError = null
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
              body: JSON.stringify({ 
                model: 'llama-3.1-8b-instant', 
                messages: [{ role: 'user', content: singlePrompt }], 
                max_tokens: 450, 
                temperature: 0.85 + (attempt * 0.05)
              }),
            })
            if (!res.ok) {
              lastError = new Error(`Groq ${res.status}`)
              if (res.status === 429) {
                await new Promise(r => setTimeout(r, 1000 * (attempt + 1)))
                continue
              }
              throw lastError
            }
            const aiData = await res.json()
            const raw = aiData.choices?.[0]?.message?.content?.trim() || '{}'
            const m = raw.match(/\{[\s\S]*\}/)
            if (!m) throw new Error('no JSON in response')
            const parsed = JSON.parse(m[0])
            const result = {}
            for (const k of unique) {
              const val = parsed[k]
              if (val && String(val).trim()) {
                result[k] = String(val)
              } else {
                const field = fieldMeta.find(f => f.key === k)
                if (field?.fieldRole === 'headline') result[k] = 'Discover what\'s next'
                else if (field?.fieldRole === 'cta') result[k] = 'Learn more today'
                else if (field?.fieldRole === 'hook') result[k] = 'This changes everything'
                else result[k] = 'Explore the possibilities'
              }
            }
            return result
          } catch (e) {
            lastError = e
            if (attempt < 2) {
              await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
            }
          }
        }
        console.error('Single image generation error:', lastError?.message)
        const result = {}
        for (const field of fieldMeta) {
          if (field.fieldRole === 'headline') result[field.key] = 'Discover what\'s next'
          else if (field.fieldRole === 'cta') result[field.key] = 'Learn more today'
          else if (field.fieldRole === 'hook') result[field.key] = 'This changes everything'
          else result[field.key] = 'Explore the possibilities'
        }
        return result
      }

      // ── GENERATE INSTAGRAM CAPTION ──
      // Creates a caption based on the generated content
      const generateCaption = async (textValues, brand, tone, groqKey) => {
        if (!groqKey) {
          // Fallback caption
          return brand?.businessName ? `Discover what ${brand.businessName} has to offer.` : 'Check this out.'
        }

        // Combine generated content into a single context for caption generation
        const contentSummary = Object.entries(textValues)
          .filter(([, v]) => typeof v === 'string' && v.length > 0)
          .map(([k, v]) => `${k}: ${v}`)
          .join('\n')

        const TONE_DESCS = {
          informative: 'Clear, factual, educational',
          helpful: 'Warm, supportive, solution-focused',
          aggressive: 'Bold, urgent, FOMO-driven',
          inspiring: 'Motivational, aspirational, emotional',
          playful: 'Fun, witty, conversational',
        }

        const prompt = [
          `You are a social media caption writer.`,
          `Brand: ${brand?.businessName || 'A brand'}`,
          `Tone: ${TONE_DESCS[tone] || TONE_DESCS.informative}`,
          ``,
          `Based on this generated content:`,
          contentSummary,
          ``,
          `Write a compelling Instagram caption (1-2 sentences, max 150 chars).`,
          `Make it engaging and on-brand.`,
          `Return ONLY the caption text, no quotes or hashtags.`,
        ].join('\n')

        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
            body: JSON.stringify({ 
              model: 'llama-3.1-8b-instant', 
              messages: [{ role: 'user', content: prompt }], 
              max_tokens: 100, 
              temperature: 0.85 
            }),
          })
          if (!res.ok) throw new Error(`Groq ${res.status}`)
          const data = await res.json()
          const caption = data.choices?.[0]?.message?.content?.trim() || 'Discover more.'
          return caption
        } catch (e) {
          console.error('Caption generation error:', e.message)
          return brand?.businessName ? `Discover what ${brand.businessName} has to offer.` : 'Check this out.'
        }
      }

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
      await db.collection('flows').updateOne({ id: flowId }, { $push: { posts: { $each: posts } }, $set: { status: 'ready', updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true, postCount: posts.length, posts }))
    }

    // Update a single post inside a flow (accept/reject/schedule)
    const flowPostMatch = route.match(/^\/flows\/([^/]+)\/posts\/([^/]+)$/)
    if (flowPostMatch && method === 'PATCH') {
      const [, flowId, postId] = flowPostMatch
      const body = await request.json().catch(() => ({}))
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
      const posts = (flow.posts || []).map(p => p.id === postId ? { ...p, ...body } : p)
      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true }))
    }

    // AI copy generation endpoint (used by edit post dialog)
    if (route === '/ai-copy' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const { key, topic, brandContext, tone, classContext } = body
      const groqKey = process.env.GROQ_API_KEY
      if (!groqKey) {
        return corsify(NextResponse.json({ text: `${topic || 'Your product'} — discover more today.` }))
      }
      const TONE_DESCS = {
        informative: 'Clear, factual, educational',
        helpful: 'Warm, supportive, solution-focused',
        aggressive: 'Bold, urgent, FOMO-driven',
        inspiring: 'Motivational, aspirational, emotional',
        playful: 'Fun, witty, conversational',
      }
      const prompt = [
        brandContext && `Context: ${brandContext}.`,
        `Write a short Instagram caption (max 15 words) about "${topic || key}".`,
        `Tone: ${TONE_DESCS[tone] || TONE_DESCS.informative}.`,
        classContext,
        'Return ONLY the caption text, no quotes, no hashtags.',
      ].filter(Boolean).join(' ')
      try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 120, temperature: 0.85 })
        })
        const data = await res.json()
        const text = data.choices?.[0]?.message?.content?.trim() || `${topic || key} — discover more.`
        return corsify(NextResponse.json({ text }))
      } catch (e) {
        return corsify(NextResponse.json({ text: `${topic || key} — discover more today.` }))
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
        const summaryPrompt = [
          `You are a content analyzer. You will read website content and create a concise business context summary.`,
          ``,
          `Website content:`,
          `${contentForAI}`,
          ``,
          `Create a 120-word summary that captures:`,
          `1. What the business/website is about`,
          `2. Key offerings or services`,
          `3. Target audience or value proposition`,
          `4. Unique selling points or key differentiators`,
          ``,
          `Write ONLY the 120-word summary. Be specific and factual. No intro/outro.`,
        ].join('\n')

        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
          body: JSON.stringify({
            model: 'llama-3.1-8b-instant',
            messages: [{ role: 'user', content: summaryPrompt }],
            max_tokens: 200,
            temperature: 0.7
          })
        })

        if (!res.ok) {
          throw new Error(`Groq API error: ${res.status}`)
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
