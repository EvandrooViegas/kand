import sharp from 'sharp'
import { generateImageOpenAI } from '@/lib/handlers/assetResolverHandler'
import { persistInlineImages } from '@/lib/services/persistInlineImages'

export async function generateCarouselSlide(db: any, prompt: string, slideNumber: number) {
  const image = await generateImageOpenAI(prompt, false, { model: process.env.OPENAI_CAROUSEL_IMAGE_MODEL, size: '1024x1536' })
  const bytes = Buffer.from(image.url.slice(image.url.indexOf(',') + 1), 'base64')
  // The prompt reserves top/bottom bleed on the provider's portrait canvas.
  const png = await sharp(bytes, { limitInputPixels: 16000000 }).resize(1080, 1350, { fit: 'cover', position: 'centre' }).png().toBuffer()
  const stored = await persistInlineImages(db, { url: 'data:image/png;base64,' + png.toString('base64') })
  return { slideNumber, url: stored.url, width: 1080, height: 1350, provider: 'openai', model: process.env.OPENAI_CAROUSEL_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2.5-sunburst' }
}
