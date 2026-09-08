import sharp from 'sharp'
import { createHash } from 'node:crypto'
import { Binary } from 'mongodb'
import { downloadLogo } from './logoBackground'
import type { ResolvedAssetPlan } from '../handlers/assetResolverHandler'

// General subjects, including people and products. Model card:
// https://huggingface.co/onnx-community/ormbg-ONNX (Apache-2.0).
const MODEL = 'onnx-community/ormbg-ONNX'
const VERSION = 'ormbg-q8-v1'
let modelPromise: Promise<any> | undefined
let inferenceQueue: Promise<unknown> = Promise.resolve()

export interface SubjectAsset { url: string; width: number; height: number }

async function segment(input: Buffer) {
  const { pipeline, RawImage, env } = require('@huggingface/transformers')
  env.cacheDir = './.cache/huggingface'
  if (!modelPromise) modelPromise = pipeline('background-removal', MODEL, { dtype: 'q8', device: 'cpu' }).catch((error: unknown) => { modelPromise = undefined; throw error })
  const model = await modelPromise
  const image = await RawImage.fromBlob(new Blob([new Uint8Array(input)], { type: 'image/png' }))
  const output = await model(image)
  const result = Array.isArray(output) ? output[0] : output
  if (result.channels !== 4) throw new Error('Background remover returned no alpha channel')
  return sharp(Buffer.from(result.data), { raw: { width: result.width, height: result.height, channels: 4 } }).png().toBuffer()
}

/** Retain soft hair edges; reject degenerate masks and trim only transparent margins. */
export async function validateSubject(png: Buffer): Promise<{ png: Buffer; width: number; height: number } | null> {
  const { data, info } = await sharp(png, { limitInputPixels: 16000000 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const total = info.width * info.height
  let opaque = 0, clear = 0, left = info.width, top = info.height, right = 0, bottom = 0
  for (let i = 0; i < total; i++) {
    const alpha = data[i * 4 + 3]
    if (alpha < 15) clear++
    if (alpha > 220) opaque++
    if (alpha > 12) {
      const x = i % info.width, y = Math.floor(i / info.width)
      left = Math.min(left, x); right = Math.max(right, x)
      top = Math.min(top, y); bottom = Math.max(bottom, y)
    }
  }
  if (opaque / total < .025 || clear / total < .08 || clear / total > .97 || left >= right || top >= bottom) return null
  const padding = 4
  left = Math.max(0, left - padding); top = Math.max(0, top - padding)
  right = Math.min(info.width - 1, right + padding); bottom = Math.min(info.height - 1, bottom + padding)
  const width = right - left + 1, height = bottom - top + 1
  const output = await sharp(png).extract({ left, top, width, height }).png().toBuffer()
  return { png: output, width, height }
}

export async function createSubject(input: Buffer): Promise<{ png: Buffer; width: number; height: number } | null> {
  const normalized = await sharp(input, { limitInputPixels: 16000000 }).rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).ensureAlpha().png().toBuffer()
  const existing = await validateSubject(normalized)
  if (existing) return existing
  // Serialize CPU inference across concurrent requests to avoid memory spikes.
  const work = inferenceQueue.then(async () => validateSubject(await segment(normalized)))
  inferenceQueue = work.catch(() => undefined)
  return work
}

async function sourceBytes(db: any, url: string): Promise<Buffer> {
  // Uploaded images are read directly from MongoDB, never fetched through localhost.
  const path = new URL(url, 'http://local.invalid').pathname
  const match = path.match(/^\/api\/uploads\/([a-zA-Z0-9-]+)$/)
  if (match) {
    const upload = await db.collection('uploads').findOne({ id: match[1] })
    if (!upload) throw new Error('Source upload missing')
    const bytes = upload.bytes?.value ? Buffer.from(upload.bytes.value()) : Buffer.from(upload.bytes)
    if (bytes.length > 6 * 1024 * 1024) throw new Error('Source too large')
    return bytes
  }
  if (url.startsWith('data:image/')) {
    if (url.length > 8 * 1024 * 1024) throw new Error('Source too large')
    return Buffer.from(url.split(',')[1] ?? '', 'base64')
  }
  return downloadLogo(url, 6 * 1024 * 1024, 15000)
}

/** Add optional derivatives; preserve original assets and the existing resolver contract. */
export async function prepareSubjectAssets(db: any, plan: ResolvedAssetPlan): Promise<ResolvedAssetPlan> {
  const slots = []
  const prepared = new Map<string, SubjectAsset | null>()
  const failures = new Map<string, string>()
  for (const slot of plan.slots) {
    const asset = slot.resolvedAsset
    if (!asset?.url || asset.subject || slot.treatment === 'environmental') { slots.push(slot); continue }
    let subject = prepared.get(asset.url)
    if (subject === undefined) {
      subject = null
      try {
        const bytes = await sourceBytes(db, asset.url)
        const id = 'subject-' + createHash('sha256').update(VERSION).update(bytes).digest('hex')
        const cached = await db.collection('uploads').findOne({ id })
        if (cached?.subject) subject = { url: `/api/uploads/${id}`, width: cached.subject.width, height: cached.subject.height }
        else {
          const cutout = await createSubject(bytes)
          if (!cutout) failures.set(asset.url, "No usable foreground silhouette detected")
          if (cutout) {
            await db.collection('uploads').updateOne({ id }, { $setOnInsert: {
              id, contentType: 'image/png', bytes: new Binary(cutout.png), createdAt: new Date(),
              subject: { width: cutout.width, height: cutout.height, model: MODEL },
            } }, { upsert: true })
            subject = { url: `/api/uploads/${id}`, width: cutout.width, height: cutout.height }
          }
        }
      } catch (error) { failures.set(asset.url, (error as Error).message); console.warn('[subject-assets] keeping original photo:', (error as Error).message) }
      prepared.set(asset.url, subject)
    }
    slots.push({ ...slot, warning: !subject && slot.treatment === 'isolated_subject' ? [slot.warning?.split('; ').filter(part => !part.startsWith('Subject isolation failed')).join('; '), 'Subject isolation failed: ' + (failures.get(asset.url) ?? 'Unknown failure') + '; original photo retained'].filter(Boolean).join('; ') : slot.warning, resolvedAsset: { ...asset, subject: subject ?? undefined } })
  }
  return { ...plan, slots }
}
