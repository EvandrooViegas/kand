/**
 * Upload/Image handlers for API routes
 */

import { NextResponse } from 'next/server'
import { Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { corsify, getBaseUrl } from '@/lib/services/middleware'
import { MAX_IMAGE_SIZE } from '@/lib/services/constants'

export async function handleUploadImage(db: any, body: any, request: Request) {
  const dataUrl = body.data
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
    return corsify(NextResponse.json({ error: 'data must be a data: URL string' }, { status: 400 }))
  }

  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/)
  if (!match) return corsify(NextResponse.json({ error: 'Invalid data URL' }, { status: 400 }))

  const contentType = match[1]
  const buf = Buffer.from(match[2], 'base64')

  if (buf.length > MAX_IMAGE_SIZE) {
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
  return corsify(
    NextResponse.json({
      id: uploadId,
      url: `${baseUrl}/api/uploads/${uploadId}`,
      relativeUrl: `/api/uploads/${uploadId}`,
    })
  )
}

export async function handleGetUpload(db: any, id: string) {
  const u = await db.collection('uploads').findOne({ id })
  if (!u) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))

  const buf = u.bytes && typeof u.bytes.value === 'function' ? u.bytes.value() : Buffer.from(u.bytes)

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': u.contentType || 'image/png',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Access-Control-Allow-Origin': '*',
    },
  })
}
