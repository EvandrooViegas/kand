// Server-Sent Events endpoint for real-time progress updates during post generation
export const runtime = 'nodejs'

export async function GET(request, { params }) {
  const { id: flowId } = params
  
  if (!flowId) {
    return new Response('Flow ID required', { status: 400 })
  }

  // Create a readable stream for Server-Sent Events
  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ step: 0, total: 8, message: 'Connected to progress stream' })}\n\n`)
      
      // Set up an interval to check progress from the database/cache
      // In a real implementation, you'd check the actual generation progress from:
      // 1. A real-time database like Redis
      // 2. WebSocket connection to backend worker
      // 3. Database polling
      
      const progressInterval = setInterval(async () => {
        try {
          // Try to fetch current progress from API
          // This endpoint would track the generation progress
          const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/api/flows/${flowId}/progress-status`)
          
          if (res.ok) {
            const progressData = await res.json()
            if (progressData.step !== undefined) {
              controller.enqueue(`data: ${JSON.stringify(progressData)}\n\n`)
            }
            
            // Close stream if generation is complete
            if (progressData.complete) {
              clearInterval(progressInterval)
              controller.close()
            }
          }
        } catch (e) {
          console.error('Error fetching progress:', e)
          // Continue trying
        }
      }, 800) // Poll every 800ms (matches the UI animation timing)

      // Clean up interval after 5 minutes
      setTimeout(() => {
        clearInterval(progressInterval)
        controller.close()
      }, 5 * 60 * 1000)
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  })
}

export async function OPTIONS() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    }
  })
}
