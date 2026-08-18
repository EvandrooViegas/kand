/**
 * Content generation utilities
 * Handles AI prompting and content creation for posts
 */

import { v4 as uuidv4 } from 'uuid'
import { Binary } from 'mongodb'
import JSZip from 'jszip'
import { buildBrandProfile, buildRecentPostsContext, extractAngleAxes } from '@/lib/services/ai/brandContext'
import { LANGUAGE_NAMES } from '@/lib/services/constants'
import { renderCanvasToPng } from '@/lib/renderCanvas'
import { generateSingleImageCopy, generateCarouselPageCopy, generateCaption, DiversityContext } from './textGenerator'

export async function generatePostContent(db: any, flow: any, body: any, baseUrl: string, canvasIds: string[]): Promise<any[]> {
  // Load canvases and prepare context
  const canvasMap = new Map()
  for (const cid of canvasIds) {
    const c = await db.collection('canvases').findOne({ id: cid })
    if (c) canvasMap.set(cid, c)
  }

  const singleCanvasIds = canvasIds.filter((id: string) => canvasMap.get(id)?.type !== 'carousel')
  const carouselCanvasIds = canvasIds.filter((id: string) => canvasMap.get(id)?.type === 'carousel')

  // Prepare AI context
  const brandProfile = buildBrandProfile(flow)
  const existingPosts = flow.posts || []
  const recentPostsCtx = buildRecentPostsContext(existingPosts, 6)
  const languageName = LANGUAGE_NAMES[flow.language] || 'English'

  // One-time, per-batch: derive THIS brand's angle pool (works for any brand —
  // it reads whatever is in brandProfile, whether that's Ikarus, a restaurant,
  // a SaaS tool, etc.) so every post in the batch draws from the same closed
  // set instead of the model re-deriving angles ad hoc per post, which is what
  // let semantically-identical angles slip through as "new" phrasing before.
  const angleCategories = await extractAngleAxes(brandProfile, languageName)

  const posts: any[] = []
  const carouselChance = body.carouselChance !== undefined ? body.carouselChance : 30

  // Shared across BOTH the carousel loop and the single-image loop below —
  // this is what makes diversity work across the whole batch instead of
  // resetting per canvas type. Just create it and pass it into every
  // generateSingleImageCopy / generateCarouselPageCopy / generateCaption
  // call below — those functions read AND write it themselves now, so there
  // is nothing else to wire up here.
  const diversity: DiversityContext = { angleCategories }

  console.log(`[Generate] Starting post generation. Single canvases: ${singleCanvasIds.length}, Carousel canvases: ${carouselCanvasIds.length}`)
  console.log(`[Generate] Canvas map has ${canvasMap.size} entries`)
  console.log(`[Generate] Angle pool for this batch: ${angleCategories.join(' | ')}`)

  // Generate 3 posts - distribute between available canvas types
  let postIndex = 0

  // Generate carousel posts first (if available)
  for (let i = 0; i < Math.min(Math.max(1, Math.floor(3 * carouselChance / 100)), carouselCanvasIds.length, 3) && postIndex < 3; i++) {
    console.log(`[Generate] ===== POST ${postIndex} START (CAROUSEL) =====`)

    const canvasId = carouselCanvasIds[i % carouselCanvasIds.length]
    console.log(`[Generate] Post ${postIndex}: Selected carousel canvas ID: ${canvasId}`)

    const canvas = canvasMap.get(canvasId)
    if (!canvas) {
      console.warn(`[Generate] ❌ Post ${postIndex}: Canvas not found in map, SKIPPING`)
      continue
    }

    console.log(`[Generate] ✅ Post ${postIndex}: Canvas found, generating carousel content...`)

    let renderData: any = {}
    let caption = ''

    try {
      // Carousel post — generate copy for each page
      const pages = [...(canvas.pages || [])].sort((a: any, b: any) => a.order - b.order)
      let hookContent: Record<string, string> | null = null

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx]
        const pageNodes = page.nodes || []
        const pageTextKeys = pageNodes
          .filter((n: any) => n.type === 'text' && n.dynamic_key)
          .map((n: any) => n.dynamic_key)

        let pageData: Record<string, string> = {}

        if (page.type === 'top_peer') {
          pageData = await generateCarouselPageCopy(
            canvas,
            pageTextKeys,
            pageNodes,
            'top_peer',
            pages.length,
            pageIdx,
            postIndex,
            null,
            brandProfile,
            recentPostsCtx,
            languageName,
            diversity
          )
          hookContent = pageData
        } else if (page.type === 'bottom_peer') {
          pageData = await generateCarouselPageCopy(
            canvas,
            pageTextKeys,
            pageNodes,
            'bottom_peer',
            pages.length,
            pageIdx,
            postIndex,
            hookContent,
            brandProfile,
            recentPostsCtx,
            languageName,
            diversity
          )
        } else {
          pageData = await generateCarouselPageCopy(
            canvas,
            pageTextKeys,
            pageNodes,
            'content',
            pages.length,
            pageIdx,
            postIndex,
            hookContent,
            brandProfile,
            recentPostsCtx,
            languageName,
            diversity
          )
        }

        // _archetype isn't a real canvas field and diversity tracking already
        // happened inside generateCarouselPageCopy — just strip it before merging.
        delete pageData._archetype

        // Store page data with suffix
        const suffix = page.type === 'top_peer' ? '_top' : page.type === 'bottom_peer' ? '_bottom' : `_${pageIdx + 1}`
        for (const [k, v] of Object.entries(pageData)) {
          renderData[`${k}${suffix}`] = v
        }
      }

      // Generate caption from all page content
      caption = await generateCaption(renderData, brandProfile, languageName, diversity)
    } catch (e) {
      console.error('Text generation error for post', postIndex, (e as Error).message)
      renderData = {}
      caption = 'Check your canvas.'
    }

    const post = {
      id: uuidv4(),
      flowId: flow.id,
      canvasId: canvas.id,
      canvasName: canvas.name,
      type: 'carousel',
      data: renderData,
      caption: caption,
      render: null,
      status: 'pending',
      createdAt: new Date(),
    }

    // Render the post
    try {
      const renderResult = await renderOnePost(canvas, renderData, baseUrl, db)
      if (renderResult) {
        post.render = renderResult
      } else {
        console.warn(`Rendering failed for post ${postIndex}, but post will still be created`)
      }
    } catch (renderError) {
      console.error(`Rendering error for post ${postIndex}:`, (renderError as Error).message)
    }

    // Always add post to array, even if rendering failed
    posts.push(post)
    console.log(`[Generate] ✅ Post ${postIndex} created and added to array: ${post.id}`)
    console.log(`[Generate] ===== POST ${postIndex} END =====\n`)
    postIndex++
  }

  // Generate single image posts (if available and we need more)
  for (let i = 0; postIndex < 3 && singleCanvasIds.length > 0; i++) {
    console.log(`[Generate] ===== POST ${postIndex} START (SINGLE) =====`)

    const canvasId = singleCanvasIds[i % singleCanvasIds.length]
    console.log(`[Generate] Post ${postIndex}: Selected single canvas ID: ${canvasId}`)

    const canvas = canvasMap.get(canvasId)
    if (!canvas) {
      console.warn(`[Generate] ❌ Post ${postIndex}: Canvas not found in map, SKIPPING`)
      continue
    }

    console.log(`[Generate] ✅ Post ${postIndex}: Canvas found, generating single image content...`)

    let renderData: any = {}
    let caption = ''

    try {
      // Single image post — generate copy for all dynamic text nodes
      const allNodes = canvas.nodes || []
      const textKeys = allNodes
        .filter((n: any) => n.type === 'text' && n.dynamic_key)
        .map((n: any) => n.dynamic_key)

      renderData = await generateSingleImageCopy(
        canvas,
        textKeys,
        allNodes,
        postIndex,
        brandProfile,
        recentPostsCtx,
        languageName,
        diversity
      )

      // _archetype isn't a real canvas field and diversity tracking already
      // happened inside generateSingleImageCopy — just strip it before use.
      delete renderData._archetype

      caption = await generateCaption(renderData, brandProfile, languageName, diversity)
    } catch (e) {
      console.error('Text generation error for post', postIndex, (e as Error).message)
      renderData = {}
      caption = 'Check your canvas.'
    }

    const post = {
      id: uuidv4(),
      flowId: flow.id,
      canvasId: canvas.id,
      canvasName: canvas.name,
      type: 'single',
      data: renderData,
      caption: caption,
      render: null,
      status: 'pending',
      createdAt: new Date(),
    }

    // Render the post
    try {
      const renderResult = await renderOnePost(canvas, renderData, baseUrl, db)
      if (renderResult) {
        post.render = renderResult
      } else {
        console.warn(`Rendering failed for post ${postIndex}, but post will still be created`)
      }
    } catch (renderError) {
      console.error(`Rendering error for post ${postIndex}:`, (renderError as Error).message)
    }

    // Always add post to array, even if rendering failed
    posts.push(post)
    console.log(`[Generate] ✅ Post ${postIndex} created and added to array: ${post.id}`)
    console.log(`[Generate] ===== POST ${postIndex} END =====\n`)
    postIndex++
  }

  console.log(`[Generate] 🎯 Generation complete. Total posts created: ${posts.length}`)
  return posts
}

export async function rerenderPost(canvas: any, renderData: any, baseUrl: string, db: any) {
  return await renderOnePost(canvas, renderData, baseUrl, db)
}

async function renderOnePost(canvas: any, renderData: any, baseUrl: string, db: any) {
  const renderId = uuidv4()
  try {
    if (canvas.type === 'carousel') {
      const pages = [...(canvas.pages || [])].sort((a: any, b: any) => a.order - b.order)
      const zip = new JSZip()

      for (let pageIdx = 0; pageIdx < pages.length; pageIdx++) {
        const page = pages[pageIdx]
        let pd = {}

        if (page.type === 'top_peer') {
          for (const [k, v] of Object.entries(renderData)) {
            if ((k as string).endsWith('_top')) pd[(k as string).replace('_top', '')] = v
          }
        } else if (page.type === 'bottom_peer') {
          for (const [k, v] of Object.entries(renderData)) {
            if ((k as string).endsWith('_bottom')) pd[(k as string).replace('_bottom', '')] = v
          }
        } else {
          const contentIdx = pages.filter((p: any) => p.type === 'content').indexOf(page)
          const suffix = `_${contentIdx + 1}`
          for (const [k, v] of Object.entries(renderData)) {
            if ((k as string).endsWith(suffix)) pd[(k as string).replace(suffix, '')] = v
          }
        }

        const pc = { ...canvas, nodes: page.nodes || [], groups: page.groups || [], classes: page.classes || {} }
        const png = await renderCanvasToPng(pc, pd)
        const lbl =
          page.type === 'top_peer'
            ? '00-top-peer'
            : page.type === 'bottom_peer'
            ? `${String(pages.length - 1).padStart(2, '0')}-bottom-peer`
            : `${String(pageIdx).padStart(2, '0')}-${(page.name || 'page').replace(/\s+/g, '-')}`
        zip.file(`${lbl}.png`, png)
      }

      const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
      await db.collection('renders').insertOne({
        id: renderId,
        canvasId: canvas.id,
        type: 'carousel',
        zip: new Binary(zipBuf),
        payload: renderData,
        approved: false,
        createdAt: new Date(),
      })

      return { url: `${baseUrl}/api/rendered/${renderId}.zip`, render_id: renderId, type: 'carousel' }
    } else {
      const png = await renderCanvasToPng(canvas, renderData)
      await db.collection('renders').insertOne({
        id: renderId,
        canvasId: canvas.id,
        type: 'single',
        png: new Binary(png),
        payload: renderData,
        approved: false,
        createdAt: new Date(),
      })
      return { url: `${baseUrl}/api/rendered/${renderId}`, render_id: renderId, type: 'single' }
    }
  } catch (e) {
    console.error('render error', (e as Error).message)
    return null
  }
}