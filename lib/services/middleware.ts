import { NextResponse } from 'next/server'

/**
 * Add CORS headers to response
 */
export function corsify(response: NextResponse): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  return response
}

/**
 * Get base URL from environment or request headers
 */
export function getBaseUrl(request: Request): string {
  // Prefer explicit env var if set
  const envBase = process.env.NEXT_PUBLIC_BASE_URL
  if (envBase) {
    let b = envBase.trim()
    if (!b.startsWith('http')) {
      b = b.includes('localhost') ? `http://${b}` : `https://${b}`
    }
    return b
  }

  // Derive from incoming request headers (works on Vercel, Render, etc.)
  const proto = request.headers.get('x-forwarded-proto') || 'https'
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || 'localhost:3000'
  return `${proto}://${host}`
}

/**
 * Centralized error response handler
 */
export function errorResponse(status: number, message: string): NextResponse {
  return corsify(
    NextResponse.json(
      { error: message },
      { status }
    )
  )
}

/**
 * Not found response
 */
export function notFoundResponse(): NextResponse {
  return errorResponse(404, 'Not found')
}

/**
 * Bad request response
 */
export function badRequestResponse(message: string): NextResponse {
  return errorResponse(400, message)
}

/**
 * Server error response
 */
export function serverErrorResponse(message: string): NextResponse {
  return errorResponse(500, message)
}
