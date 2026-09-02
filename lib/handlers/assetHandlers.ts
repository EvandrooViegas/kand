/**
 * Asset handlers — upload, local AI analysis, list, delete.
 */

import { NextResponse } from 'next/server'
import { Binary } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import sharp from 'sharp'
import { corsify, getBaseUrl } from '@/lib/services/middleware'
import { analyseImageBuffer } from '@/lib/services/visionAnalysis'

// ─── thumbnail ────────────────────────────────────────────────────────────────

async function makeThumbnail(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize(400, 400, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer()
}

function calcOrientation(w: number, h: number): string {
  if (w > h) return 'landscape'
  if (h > w) return 'portrait'
  return 'square'
}

// ─── route handlers ───────────────────────────────────────────────────────────

export async function handleUploadAsset(db: any, body: any, request: Request) {
  const { data, filename, brand_id } = body

  if (!data || typeof data !== 'string' || !data.startsWith('data:')) {
    return corsify(NextResponse.json({ error: 'data must be a base64 data URL' }, { status: 400 }))
  }
  if (!brand_id) {
    return corsify(NextResponse.json({ error: 'brand_id is required' }, { status: 400 }))
  }

  // Parse data URL without regex (regex on multi-MB strings blows the call stack)
  const commaIdx     = data.indexOf(',')
  const headerPart   = commaIdx !== -1 ? data.slice(0, commaIdx) : ''
  const base64Part   = commaIdx !== -1 ? data.slice(commaIdx + 1) : ''
  const colonIdx     = headerPart.indexOf(':')
  const semicolonIdx = headerPart.indexOf(';')
  const mime_type: string = (colonIdx !== -1 && semicolonIdx !== -1)
    ? headerPart.slice(colonIdx + 1, semicolonIdx) : ''

  if (!mime_type || !base64Part) {
    return corsify(NextResponse.json({ error: 'Invalid data URL' }, { status: 400 }))
  }

  const buf = Buffer.from(base64Part, 'base64')

  if (buf.length > 10 * 1024 * 1024) {
    return corsify(NextResponse.json({ error: 'Image too large (max 10MB)' }, { status: 413 }))
  }

  let width = 0, height = 0
  try {
    const meta = await sharp(buf).metadata()
    width  = meta.width  ?? 0
    height = meta.height ?? 0
  } catch {
    return corsify(NextResponse.json({ error: 'Could not read image metadata' }, { status: 400 }))
  }

  const baseUrl     = getBaseUrl(request)
  const assetId     = `asset_${uuidv4().replace(/-/g, '').slice(0, 16)}`
  const uploadId    = uuidv4()
  const thumbId     = uuidv4()
  const orientation = calcOrientation(width, height)
  const now         = new Date()

  await db.collection('uploads').insertOne({
    id: uploadId, contentType: mime_type, bytes: new Binary(buf), createdAt: now,
  })

  const thumbBuf = await makeThumbnail(buf)
  await db.collection('uploads').insertOne({
    id: thumbId, contentType: 'image/jpeg', bytes: new Binary(thumbBuf), createdAt: now,
  })

  const url           = `${baseUrl}/api/uploads/${uploadId}`
  const thumbnail_url = `${baseUrl}/api/uploads/${thumbId}`

  const assetDoc: any = {
    id: assetId,
    brand_id,
    url,
    thumbnail_url,
    filename:    filename || 'image',
    mime_type,
    width,
    height,
    orientation,
    tags:        [],
    embedding:   [],
    status:      'processing',
    usage_count: 0,
    last_used_at: null,
    created_at:  now,
    updated_at:  now,
  }

  await db.collection('assets').insertOne(assetDoc)

  // Async analysis — does not block the HTTP response
  ;(async () => {
    try {
      const analysis = await analyseImageBuffer(buf, mime_type)
      await db.collection('assets').updateOne(
        { id: assetId },
        { $set: { tags: analysis.tags, status: 'ready', updated_at: new Date() } },
      )
    } catch (err: any) {
      console.error('[asset] Analysis failed:', err?.message ?? err)
      await db.collection('assets').updateOne(
        { id: assetId },
        { $set: { status: 'failed', updated_at: new Date() } },
      )
    }
  })()

  const { _id, ...rest } = assetDoc
  return corsify(NextResponse.json(rest))
}

export async function handleListAssets(db: any, brand_id: string) {
  if (!brand_id) {
    return corsify(NextResponse.json({ error: 'brand_id is required' }, { status: 400 }))
  }
  const list = await db.collection('assets')
    .find({ brand_id })
    .sort({ created_at: -1 })
    .limit(500)
    .toArray()
  return corsify(NextResponse.json(list.map(({ _id, ...rest }: any) => rest)))
}

export async function handleGetAsset(db: any, id: string) {
  const asset = await db.collection('assets').findOne({ id })
  if (!asset) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  const { _id, ...rest } = asset
  return corsify(NextResponse.json(rest))
}

export async function handleDeleteAsset(db: any, id: string) {
  await db.collection('assets').deleteOne({ id })
  return corsify(NextResponse.json({ success: true }))
}
