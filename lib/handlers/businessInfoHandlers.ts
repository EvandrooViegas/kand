import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import { extractBusinessInfoFromWebsite } from '@/lib/services/ai/websiteExtractor'

export async function handleExtractBusinessInfo(body: any) {
  try {
    const { url } = body

    if (!url) {
      return corsify(
        NextResponse.json(
          { error: 'URL is required' },
          { status: 400 }
        )
      )
    }

    // Extract business info using Fetch + Groq AI
    const extractedInfo = await extractBusinessInfoFromWebsite(url.trim())
    return corsify(NextResponse.json(extractedInfo))
  } catch (error: any) {
    console.error('Business info extraction error:', error)
    return corsify(
      NextResponse.json(
        { error: error?.message || 'Failed to extract business info' },
        { status: 500 }
      )
    )
  }
}
