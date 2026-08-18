import { NextResponse } from 'next/server'
import { connectToMongo } from '@/lib/services/db/mongo'
import { corsify } from '@/lib/services/middleware'
import { handleGetCanvases, handleCreateCanvas, handleDuplicateCanvas, handleGetCanvas, handleUpdateCanvas, handleDeleteCanvas } from '@/lib/handlers/canvasHandlers'
import { handleGetGalleries, handleCreateGallery, handleGetGallery, handleUpdateGallery, handleDeleteGallery } from '@/lib/handlers/galleryHandlers'
import { handleGetFlows, handleCreateFlow, handleGetFlow, handleUpdateFlow, handleDeleteFlow } from '@/lib/handlers/flowHandlers'
import { handleUploadImage, handleGetUpload } from '@/lib/handlers/uploadHandlers'
import { handleRender, handleGetRendered, handleGetRenders, handleApproveRender, handleDeleteRender } from '@/lib/handlers/renderHandlers'
import { handleGeneratePosts, handleUpdatePost } from '@/lib/handlers/flowGenerationHandlers'
import { handleExtractBrandInfo } from '@/lib/handlers/extractHandlers'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function OPTIONS() {
  return corsify(new NextResponse(null, { status: 200 }))
}

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // Root
    if (route === '/' && method === 'GET') {
      return corsify(NextResponse.json({ message: 'DynaCanvas API' }))
    }

    // Extract brand info (no DB needed)
    if (route === '/extract-brand-info' && method === 'POST') {
      return await handleExtractBrandInfo(await request.json())
    }

    // Canvas routes
    if (route === '/canvases' && method === 'GET') return await handleGetCanvases(db)
    if (route === '/canvases' && method === 'POST') return await handleCreateCanvas(db, await request.json())
    const dupMatch = route.match(/^\/canvases\/([^/]+)\/duplicate$/)
    if (dupMatch && method === 'POST') return await handleDuplicateCanvas(db, dupMatch[1])
    const canvasMatch = route.match(/^\/canvases\/([^/]+)$/)
    if (canvasMatch) {
      if (method === 'GET') return await handleGetCanvas(db, canvasMatch[1])
      if (method === 'PUT') return await handleUpdateCanvas(db, canvasMatch[1], await request.json())
      if (method === 'DELETE') return await handleDeleteCanvas(db, canvasMatch[1])
    }

    // Upload routes
    if (route === '/uploads' && method === 'POST') return await handleUploadImage(db, await request.json(), request)
    const uploadMatch = route.match(/^\/uploads\/([^/]+)$/)
    if (uploadMatch && method === 'GET') return await handleGetUpload(db, uploadMatch[1])

    // Render routes
    if (route === '/render' && method === 'POST') return await handleRender(db, await request.json(), request)
    const renderedMatch = route.match(/^\/rendered\/([^/]+?)(?:\.(png|zip))?$/)
    if (renderedMatch && method === 'GET') return await handleGetRendered(db, renderedMatch[1])
    if (route === '/renders' && method === 'GET') return await handleGetRenders(db)
    const renderApproveMatch = route.match(/^\/renders\/([^/]+)\/approve$/)
    if (renderApproveMatch && method === 'POST') return await handleApproveRender(db, renderApproveMatch[1])
    const renderDeleteMatch = route.match(/^\/renders\/([^/]+)$/)
    if (renderDeleteMatch && method === 'DELETE') return await handleDeleteRender(db, renderDeleteMatch[1])

    // Gallery routes
    if (route === '/galleries' && method === 'GET') return await handleGetGalleries(db)
    if (route === '/galleries' && method === 'POST') return await handleCreateGallery(db, await request.json())
    const galleryMatch = route.match(/^\/galleries\/([^/]+)$/)
    if (galleryMatch) {
      if (method === 'GET') return await handleGetGallery(db, galleryMatch[1])
      if (method === 'PUT') return await handleUpdateGallery(db, galleryMatch[1], await request.json())
      if (method === 'DELETE') return await handleDeleteGallery(db, galleryMatch[1])
    }

    // Flow routes
    if (route === '/flows' && method === 'GET') return await handleGetFlows(db)
    if (route === '/flows' && method === 'POST') return await handleCreateFlow(db, await request.json())
    const flowMatch = route.match(/^\/flows\/([^/]+)$/)
    if (flowMatch) {
      if (method === 'GET') return await handleGetFlow(db, flowMatch[1])
      if (method === 'PUT') return await handleUpdateFlow(db, flowMatch[1], await request.json())
      if (method === 'DELETE') return await handleDeleteFlow(db, flowMatch[1])
    }

    // Flow generation routes
    const flowIdeasMatch = route.match(/^\/flows\/([^/]+)\/generate-ideas$/)
    if (flowIdeasMatch && method === 'POST') return await handleGenerateIdeas(db, flowIdeasMatch[1], await request.json())

    const flowGenerateMatch = route.match(/^\/flows\/([^/]+)\/generate$/)
    if (flowGenerateMatch && method === 'POST') return await handleGeneratePosts(db, flowGenerateMatch[1], await request.json(), request)

    const postUpdateMatch = route.match(/^\/flows\/([^/]+)\/posts\/([^/]+)$/)
    if (postUpdateMatch && method === 'PUT') return await handleUpdatePost(db, postUpdateMatch[1], postUpdateMatch[2], await request.json(), request)

    return corsify(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (error) {
    console.error('API Error:', error)
    return corsify(NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 }))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
