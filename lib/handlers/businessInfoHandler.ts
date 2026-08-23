import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'

export async function handleExtractBusinessInfo(body: any) {
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

    // Dynamically import the extractor at runtime to avoid build issues
    const extractorModule = await import('@/lib/business-info-extractor-complete')
    const { extractBusinessInfo } = extractorModule

    // Call the extractor with the provided URL
    const businessInfo = await extractBusinessInfo(url)

    return corsify(NextResponse.json(businessInfo))
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
