// Legacy endpoint - kept for compatibility but returns immediate response
// Progress tracking is now handled via progress-status polling
export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const flowId = params?.id
  
  if (!flowId) {
    return new Response(JSON.stringify({ error: 'Flow ID required' }), { status: 400 })
  }

  // Return empty stream immediately - generation happens synchronously
  const stream = new ReadableStream({
    start(controller) {
      try {
        controller.enqueue(`data: ${JSON.stringify({ step: 0, total: 8, message: 'Generating posts...' })}\n\n`)
        controller.close()
      } catch (e) {
        // Already closed or error
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'close',
    }
  })
}

export async function OPTIONS() {
  return new Response(null, { status: 200 })
}
