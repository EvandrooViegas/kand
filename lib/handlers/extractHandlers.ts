import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'

/**
 * Extract brand info from website URL
 */
export async function handleExtractBrandInfo(body: any) {
  const { url } = body

  if (!url || typeof url !== 'string') {
    return corsify(NextResponse.json({ error: 'URL is required' }, { status: 400 }))
  }

  try {
    // Validate and normalize URL
    let urlToFetch = url
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      urlToFetch = `https://${url}`
    }

    // Fetch the page with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10s timeout

    const response = await fetch(urlToFetch, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return corsify(
        NextResponse.json({ error: `Failed to fetch website: ${response.statusText}` }, { status: 400 })
      )
    }

    const html = await response.text()

    // Extract title (from <title> or og:title)
    let businessName = ''
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/)
    if (titleMatch) businessName = titleMatch[1].trim().split('|')[0].trim()

    // Extract description (from meta description or og:description)
    let description = ''
    const descMatch = html.match(/<meta\s+name="description"\s+content="([^"]+)"/)
    if (descMatch) description = descMatch[1].trim()

    // Extract from og:description if no meta description
    if (!description) {
      const ogDescMatch = html.match(/<meta\s+property="og:description"\s+content="([^"]+)"/)
      if (ogDescMatch) description = ogDescMatch[1].trim()
    }

    // Limit description to first 500 chars
    if (description.length > 500) description = description.substring(0, 500) + '...'

    // Try to extract keywords (target audience hints)
    const keywordsMatch = html.match(/<meta\s+name="keywords"\s+content="([^"]+)"/)
    let keywords = ''
    if (keywordsMatch) keywords = keywordsMatch[1].trim()

    return corsify(
      NextResponse.json({
        businessName: businessName || 'Website',
        description: description || 'No description found on website',
        targetAudience: keywords || 'Not specified',
        brandVoice: 'Professional', // Default voice
        extra: keywords ? `Keywords: ${keywords.substring(0, 100)}` : '',
      })
    )
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)

    // Provide helpful error messages
    if (error.includes('ENOTFOUND') || error.includes('getaddrinfo')) {
      return corsify(NextResponse.json({ error: 'Website not found. Check the URL.' }, { status: 400 }))
    }
    if (error.includes('AbortError') || error.includes('timeout')) {
      return corsify(NextResponse.json({ error: 'Website took too long to respond' }, { status: 400 }))
    }

    console.error('Extract brand info error:', error)
    return corsify(NextResponse.json({ error: `Failed to extract info: ${error}` }, { status: 500 }))
  }
}
