import { NextResponse } from 'next/server'
import { corsify, getBaseUrl } from '@/lib/services/middleware'
import { generateLogoVariants } from '@/lib/services/logoVariants'
import { importWebsiteImages } from '@/lib/services/importWebsiteImages'
import { withMinimumBrandDesigns } from '@/lib/designs/minimumBrandDesigns'
import { randomUUID } from 'node:crypto'
import { persistInlineImages } from '@/lib/services/persistInlineImages'

export async function handleExtractBusinessInfo(body: any, db: any, request: Request) {
  try {
    const { url } = body

    if (!url || typeof url !== 'string') {
      return corsify(
        NextResponse.json(
          { error: 'URL is required and must be a string' },
          { status: 400 }
        )
      )
    }

    if (body.flowId != null && typeof body.flowId !== 'string') return corsify(NextResponse.json({ error: 'Invalid brand ID' }, { status: 400 }))
    const existing = body.flowId ? await db.collection('flows').findOne({ id: body.flowId }) : null
    if (body.flowId && !existing) return corsify(NextResponse.json({ error: 'Brand not found' }, { status: 404 }))

    // Dynamically import the extractor at runtime to avoid build issues
    const extractorModule = await import('@/lib/business-info-extractor-complete')
    const { extractBusinessInfo } = extractorModule

    // Call the extractor with the provided URL
    const businessInfo = await extractBusinessInfo(url)

    if (businessInfo.logo) {
      try { businessInfo.logoVariants = await generateLogoVariants(businessInfo.logo) }
      catch (error: any) { businessInfo.logoVariantsError = error.message }
    }
    const { websiteImages = [], ...profile } = businessInfo
    const flowId = existing?.id || randomUUID()
    const brandContext = await persistInlineImages(db, withMinimumBrandDesigns({
      ...existing?.brandContext, ...profile,
      logoVariants: profile.logoVariants || null,
      colors: profile.designSystem?.colors || [], fonts: profile.designSystem?.fonts || [],
    }))
    const now = new Date()
    if (existing) {
      await db.collection('flows').updateOne({ id: flowId }, { $set: { brandContext, updatedAt: now } })
    } else {
      await db.collection('flows').insertOne({ id: flowId, name: profile.name || 'New brand', brandContext, brandAnswers: {}, brandQuestions: [], extractedContext: '', tone: 'informative', language: 'english', posts: [], createdAt: now, updatedAt: now })
    }
    const imageImport = await importWebsiteImages(db, `brand_${flowId}`, websiteImages, getBaseUrl(request))
    const flow = await db.collection('flows').findOne({ id: flowId })
    return corsify(NextResponse.json({ ...profile, logo: brandContext.logo, logoVariants: brandContext.logoVariants, flow, imageImport }))
  } catch (error: any) {
    console.error('Business info extraction error:', error)
    return corsify(
      NextResponse.json(
        {
          error: error.message || 'Failed to extract business information',
        },
        { status: 500 }
      )
    )
  }
}
