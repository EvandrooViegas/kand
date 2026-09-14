import { GROQ_URL, MODEL_MAIN, MODEL_FAST } from '../constants'
import Groq from 'groq-sdk'
import { budgetedCompletion } from './requestBudget'

/**
 * Call Groq API with retry and exponential backoff
 */
export async function callGroq({
  prompt,
  model = MODEL_MAIN,
  temperature = 0.85,
  maxTokens = 500,
  jsonMode = false,
  retries = 3,
}: {
  prompt: string
  model?: string
  temperature?: number
  maxTokens?: number
  jsonMode?: boolean
  retries?: number
}): Promise<string> {
  const key = process.env.GROQ_API_KEY || process.env.GROQ_API_KEY_2
  if (!key) throw new Error('GROQ_API_KEY not set')

  let lastError: Error | null = null

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const body: any = {
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature: temperature + attempt * 0.03,
      }

      if (jsonMode) {
        body.response_format = { type: 'json_object' }
      }

      const data = await budgetedCompletion(new Groq({apiKey:key,maxRetries:0}),body)
      return data.choices?.[0]?.message?.content?.trim() || ''
    } catch (e) {
      if ([429,401,403].includes((e as any)?.status)) throw e
      lastError = e instanceof Error ? e : new Error(String(e))
      if (attempt < retries - 1) {
        const delayMs = 500 * (attempt + 1)
        await new Promise((r) => setTimeout(r, delayMs))
      }
    }
  }

  throw lastError || new Error('Groq call failed after retries')
}

/**
 * Extract JSON from text (handles jsonMode and regex extraction)
 */
export function extractJson(text: string | null, fallback: any = null): any {
  if (!text) return fallback

  // Try direct parse first (works with jsonMode)
  try {
    return JSON.parse(text)
  } catch (_) {
    // pass
  }

  // Try to find JSON object or array in the text
  const objMatch = text.match(/\{[\s\S]*\}/)
  const arrMatch = text.match(/\[[\s\S]*\]/)
  const candidates = [objMatch?.[0], arrMatch?.[0]].filter(Boolean)

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate)
    } catch (_) {
      // pass
    }
  }

  return fallback
}
