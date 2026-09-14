/** Generate a single brand design with retry logic for rate limits. */
export async function generateSingleDesign({
  flowId,
  brand,
  onSaved,
  onProgress,
  request = fetch,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
}) {
  let latest = brand

  // Try up to 5 times in case of rate limits
  for (let attempt = 0; attempt < 5; attempt++) {
    onProgress('Generating design...')
    
    const response = await request('/api/brand-designs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ flowId, brandContext: latest })
    })
    
    const data = await response.json()

    // Handle rate limit with retry
    if (response.status === 429 && attempt < 4) {
      const seconds = Math.max(61, Math.min(120, Number(response.headers.get('retry-after')) || 61))
      onProgress(`Rate limit reached. Waiting ${seconds}s before retrying...`)
      await wait(seconds * 1000)
      continue
    }

    // Handle other errors
    if (!response.ok) {
      throw new Error(data.error || 'Generation failed')
    }

    if (!data.brandContext) {
      throw new Error('Generation returned no saved design')
    }

    latest = data.brandContext
    onSaved(latest)
    return latest
  }

  throw new Error('Failed to generate design after 5 attempts')
}
