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

      const prompt = [
        `You are a social media content strategist.`,
        `Brand: ${brandCtx || 'A modern brand looking to grow on Instagram.'}`,
        ``,
        `Generate 8 unique, specific, and actionable content ideas for Instagram posts.`,
        `Each idea is a short content angle or post concept — max 15 words, written as a concrete action (e.g. "Share 3 mistakes beginners make in X").`,
        `Tone: ${TONE_LABELS[tone] || TONE_LABELS.informative}.`,
        `Vary the formats: tips, stories, showcases, questions, behind-the-scenes, challenges, how-tos, etc.`,
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
      const flow = await db.collection('flows').findOne({ id: flowId })
      if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

      const baseUrl  = getBaseUrl(request)
      const brand    = flow.brandContext || {}
      const groqKey  = process.env.GROQ_API_KEY
      // New data model: flow.selectedCanvases (array of ids), flow.galleryId, flow.tone
      const canvasIds    = flow.selectedCanvases || (flow.canvasConfigs || []).map(c => c.canvasId)
      const galleryId    = flow.galleryId || null
      const tone         = flow.tone || 'informative'
      // Selected content ideas (array of {id, text, selected} or plain strings)
      const contentIdeas = (flow.contentIdeas || [])
        .filter(i => i.selected !== false)
        .map(i => (typeof i === 'string' ? i : i.text))
        .filter(Boolean)

      if (canvasIds.length === 0) return corsify(NextResponse.json({ error: 'No canvases selected' }, { status: 400 }))

      // Load gallery images
      const galleryImages = galleryId
        ? ((await db.collection('galleries').findOne({ id: galleryId }))?.images || [])
        : []

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

      // Ask Groq to fill ALL text keys for one post in a single call
      const aiGenerateTextKeys = async (canvas, textKeys, allNodes, postIndex, idea = null) => {
        if (textKeys.length === 0) return {}
        const unique = [...new Set(textKeys)]
        const classNames = Object.keys(canvas.classes || {})
        const classCtx = classNames.length
          ? `\nCanvas styling classes: ${classNames.join(', ')}. For maximum impact you MAY wrap one key phrase per field using <%kind:.classname:phrase%> syntax.`
          : ''

        // Build per-field size hints so the AI knows exactly how much space each field has
        const fieldMeta = unique.map(k => {
          const node = allNodes.find(n => n.dynamic_key === k && n.type === 'text')
          if (!node) return { key: k, hint: '(short text)' }
          const fs = node.fontSize || 48
          const w  = node.width  || 200
          const h  = node.height || 100
          // Estimate max characters that fit: chars per line × max lines
          const charsPerLine = Math.max(4, Math.floor(w / (fs * 0.55)))
          const maxLines     = Math.max(1, Math.floor(h / (fs * 1.2)))
          const maxChars     = charsPerLine * maxLines
          // Convert to a word budget (avg 6 chars/word)
          const maxWords = Math.max(2, Math.floor(maxChars / 6))
          return { key: k, hint: `max ${maxWords} words (${w}×${h}px, ${fs}px font — HARD LIMIT, going over breaks the layout)` }
        })

        const prompt = [
          `You are writing copy for a PREMADE fixed-size visual layout that will be posted on Instagram.`,
          `CRITICAL: This is a visual design with fixed dimensions. If your text is too long it will overflow and break the layout. You MUST stay within the word limits below for each field — no exceptions.`,
          ``,
          `Brand context: ${brandCtx || 'a modern brand seeking engagement'}.`,
          `Layout name: "${canvas.name}" (${canvas.type === 'carousel' ? 'carousel post' : 'single image post'}).`,
          `Tone: ${toneDesc}${classCtx}`,
          ``,
          `Fill these ${unique.length} field(s). Each field has its own STRICT word limit based on the available space in the layout:`,
          fieldMeta.map(({ key, hint }) => `  - "${key}": ${hint}`).join('\n'),
          ``,
          `Rules:`,
          `• NEVER exceed the word limit for each field — the layout is fixed and cannot resize`,
          `• No hashtags, no quotation marks, no emojis`,
          `• Write punchy social media copy — impactful, direct, action-oriented`,
          idea
            ? `• Content angle for THIS post: "${idea}" — your copy MUST be specifically about this angle, not generic`
            : `• Post #${postIndex + 1} of 3 — make this variation meaningfully different from the others`,
          ``,
          'Respond ONLY with a valid JSON object mapping each field name to its generated text, e.g.: {"title":"Bold vision. Real results","subtitle":"Built for creators who move fast"}',
        ].join('\n')

        if (!groqKey) {
          return Object.fromEntries(unique.map(k => [k, `${brand.businessName || canvas.name} — discover more`]))
        }
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${groqKey}` },
            body: JSON.stringify({ model: 'llama-3.1-8b-instant', messages: [{ role: 'user', content: prompt }], max_tokens: 500, temperature: 0.9 }),
          })
          if (!res.ok) throw new Error(`Groq ${res.status}`)
          const aiData = await res.json()
          const raw = aiData.choices?.[0]?.message?.content?.trim() || '{}'
          const m = raw.match(/\{[\s\S]*\}/)
          if (!m) throw new Error('no JSON')
          const parsed = JSON.parse(m[0])
          const result = {}
          for (const k of unique) result[k] = String(parsed[k] || `${brand.businessName || canvas.name}`)
          return result
        } catch (e) {
          console.error('Groq error', e.message)
          return Object.fromEntries(unique.map(k => [k, `${brand.businessName || canvas.name} — discover more`]))
        }
      }


      // Render a canvas with given data
      const renderOnePost = async (canvas, renderData) => {
        const renderId = uuidv4()
        try {
          if (canvas.type === 'carousel') {
            const pages = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
            const zip = new JSZip()
            for (const page of pages) {
              let pd = { ...renderData }
              if (page.type === 'top_peer') for (const [k, v] of Object.entries(renderData)) pd[`${k}_top`] = v
              else if (page.type === 'bottom_peer') for (const [k, v] of Object.entries(renderData)) pd[`${k}_bottom`] = v
              else { const ci = pages.filter(p => p.type === 'content').indexOf(page); for (const [k, v] of Object.entries(renderData)) pd[`${k}_${ci + 1}`] = v }
              const pc = { ...canvas, nodes: page.nodes || [], groups: page.groups || [], classes: page.classes || {} }
              const png = await renderCanvasToPng(pc, pd)
              const lbl = page.type === 'top_peer' ? '00-top-peer' : page.type === 'bottom_peer' ? `${String(pages.indexOf(page)).padStart(2,'0')}-bottom-peer` : `${String(pages.indexOf(page)).padStart(2,'0')}-${(page.name||'page').replace(/\s+/g,'-')}`
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

      // ── Generate 3 posts, randomizing canvas selection ──
      const posts = []
      const shuffled = [...canvasIds].sort(() => Math.random() - 0.5)

      for (let i = 0; i < 3; i++) {
        const canvasId = shuffled[i % shuffled.length]
        const canvas = await db.collection('canvases').findOne({ id: canvasId })
        if (!canvas) continue

        // Collect all dynamic keys
        const allNodes = [...(canvas.nodes || []), ...(canvas.pages || []).flatMap(p => p.nodes || [])]
        const textKeys  = allNodes.filter(n => n.dynamic_key && n.type === 'text').map(n => n.dynamic_key)
        const imageKeys = [...new Set(allNodes.filter(n => n.dynamic_key && n.type === 'image').map(n => n.dynamic_key))]

        // 1. AI generates all text content in one shot
        // Pick the content idea for this post (cycle through selected ideas)
        const idea = contentIdeas.length > 0 ? contentIdeas[i % contentIdeas.length] : null
        const textValues = await aiGenerateTextKeys(canvas, textKeys, allNodes, i, idea)

        // 2. Pick random images from gallery
        const imageValues = {}
        for (const key of imageKeys) {
          if (galleryImages.length > 0) imageValues[key] = galleryImages[Math.floor(Math.random() * galleryImages.length)]
        }

        const renderData = { ...textValues, ...imageValues }

        // 3. Render
        const renderResult = await renderOnePost(canvas, renderData)

        posts.push({ id: uuidv4(), canvasId: canvas.id, canvasName: canvas.name, canvasType: canvas.type === 'carousel' ? 'carousel' : 'single', data: renderData, render: renderResult, status: 'pending', scheduledAt: null, createdAt: new Date() })
      }

      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, status: 'ready', updatedAt: new Date() } })
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
