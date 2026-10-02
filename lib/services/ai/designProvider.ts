import { isTransientProviderError, retryProviderOperation } from './requestBudget'

/** Separate-provider fallback for both vision analysis and JSON drafting. */
export async function withDesignProviderFallback(primary: () => Promise<any>, request: any, options: any = {}) {
  try {
    // Conservative preflight estimate, not a tokenizer: reserve room below TPM.
    const inputEstimate = (request.messages || []).reduce((sum: number, message: any) => sum + (typeof message.content === 'string' ? Math.ceil(message.content.length / 3) : (message.content || []).reduce((n: number, part: any) => n + (part.type === 'image_url' ? 2048 : Math.ceil((part.text || '').length / 3)), 0)), 0)
    const budget = Number(process.env.GROQ_DESIGN_TOKEN_BUDGET) || 7000
    if (process.env.OPENAI_API_KEY && inputEstimate + (request.max_tokens || 0) > budget) throw Object.assign(Error('Design request exceeds the primary provider budget.'), { status: 413 })
    return await primary()
  }
  catch (error: any) {
    const eligible = isTransientProviderError(error) || [401,403,404,413].includes(Number(error?.status))
    if (!eligible || !process.env.OPENAI_API_KEY) throw error
    await options.onFallback?.('openai')
    const send = options.fetch || fetch
    const model = process.env.OPENAI_DESIGN_MODEL || 'gpt-4.1-mini'
    return retryProviderOperation(async () => {
      const response = await send('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: AbortSignal.timeout(60000),
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, messages: request.messages, temperature: request.temperature, response_format: request.response_format, max_completion_tokens: request.max_tokens }),
      })
      const data = await response.json()
      if (!response.ok) throw Object.assign(new Error(`OpenAI fallback request failed (${response.status}).`), { status: response.status, code: data.error?.code })
      if (!data.choices?.[0]?.message?.content) throw Object.assign(Error('OpenAI returned an empty design response.'), { status: 502 })
      return data
    }, { maxWaitMs: 10000, maxRetries: 1, ...options.retry })
  }
}