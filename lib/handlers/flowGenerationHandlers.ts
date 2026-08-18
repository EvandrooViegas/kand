/**
 * Flow generation handlers - AI content generation for posts
 * Note: This handler delegates to lib/generators for actual generation logic
 */

import { NextResponse } from 'next/server'
import { corsify, getBaseUrl } from '@/lib/services/middleware'
import { generatePostContent, rerenderPost } from '@/lib/generators/contentGenerator'

export async function handleGeneratePosts(db: any, flowId: string, body: any, request: Request) {
  const flow = await db.collection('flows').findOne({ id: flowId })
  if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

  const canvasIds = flow.selectedCanvases || (flow.canvasConfigs || []).map((c: any) => c.canvasId)
  if (canvasIds.length === 0) return corsify(NextResponse.json({ error: 'No canvases selected' }, { status: 400 }))

  try {
    const baseUrl = getBaseUrl(request)
    const posts = await generatePostContent(db, flow, body, baseUrl, canvasIds)
    await db.collection('flows').updateOne({ id: flowId }, { $push: { posts: { $each: posts } }, $set: { updatedAt: new Date() } })
    return corsify(NextResponse.json({ posts }))
  } catch (e) {
    console.error('Generation error:', (e as Error).message)
    return corsify(NextResponse.json({ error: (e as Error).message }, { status: 500 }))
  }
}

export async function handleUpdatePost(db: any, flowId: string, postId: string, body: any, request: Request) {
  const flow = await db.collection('flows').findOne({ id: flowId })
  if (!flow) return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))

  const post = (flow.posts || []).find((p: any) => p.id === postId)
  if (!post) return corsify(NextResponse.json({ error: 'Post not found' }, { status: 404 }))

  try {
    // Handle status updates (like deleted, accepted, etc.)
    if (body.status) {
      const posts = (flow.posts || []).map((p: any) => 
        p.id === postId ? { ...p, status: body.status } : p
      )
      await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
      return corsify(NextResponse.json({ success: true }))
    }

    // Handle data rerender
    const canvas = await db.collection('canvases').findOne({ id: post.canvasId })
    if (!canvas) return corsify(NextResponse.json({ error: 'Canvas not found' }, { status: 404 }))

    const baseUrl = getBaseUrl(request)
    const newData = body.data || {}
    const renderResult = await rerenderPost(canvas, newData, baseUrl, db)

    const posts = (flow.posts || []).map((p: any) => (p.id === postId ? { ...p, data: newData, render: renderResult } : p))
    await db.collection('flows').updateOne({ id: flowId }, { $set: { posts, updatedAt: new Date() } })
    return corsify(NextResponse.json({ success: true }))
  } catch (e) {
    console.error('Update post error:', (e as Error).message)
    return corsify(NextResponse.json({ error: (e as Error).message }, { status: 500 }))
  }
}
