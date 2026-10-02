import { resilientModels, resilientCompletion } from './requestBudget'
/** Use the account's live catalog; a listed model can still be access-restricted. */
export async function availableGroqCompletion(groq: any, request: any, modelEnv = 'GROQ_BRAND_DESIGN_MODEL', options: any = {}) {
  const deadline = options.deadline ?? Date.now() + 120000
  const catalog = await resilientModels(groq, { maxWaitMs: Math.max(0, Math.min(options.maxWaitMs ?? 30000, deadline - Date.now())), maxRetries: 2 })
  const preferred = [process.env[modelEnv], 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean)
  const models = preferred.filter((id, index) => preferred.indexOf(id) === index && catalog.data.some((m: any) => m.id === id && m.active !== false))
  if (!models.length) throw new Error(`No supported chat model is available in this Groq account. Configure ${modelEnv} with an accessible chat model.`)
  let capacityError: any
  for (const model of models) {
    const remaining = deadline - Date.now()
    if (remaining <= 0) throw capacityError || Object.assign(new Error('AI model failover time limit reached.'), { status: 503 })
    try { return await resilientCompletion(groq,{...request, model}, { maxWaitMs: Math.min(options.maxWaitMs ?? 30000, remaining), maxRetries: options.maxRetries ?? 2 }) }
    catch (error: any) {
      if ([502, 503, 504].includes(Number(error.status))) { capacityError = error; continue }
      const code = error?.error?.error?.code || error?.error?.code || error?.code
      const message = error?.error?.error?.message || error?.error?.message || error?.message || ''
      const incompatible = error.status === 400 && /does not support chat completions/i.test(message)
      if (error.status !== 404 && !incompatible && !['model_not_found', 'model_permission_blocked', 'model_terms_required'].includes(code)) throw error
    }
  }
  if (capacityError) throw capacityError
  throw new Error('Groq could not use any of the supported chat models. Check model permissions and required terms in your Groq project.')
}
