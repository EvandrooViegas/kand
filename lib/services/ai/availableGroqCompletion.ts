import { budgetedModels, budgetedCompletion } from './requestBudget'
/** Use the account's live catalog; a listed model can still be access-restricted. */
export async function availableGroqCompletion(groq: any, request: any, modelEnv = 'GROQ_BRAND_DESIGN_MODEL') {
  const catalog = await budgetedModels(groq)
  const preferred = [process.env[modelEnv], 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean)
  const models = preferred.filter((id, index) => preferred.indexOf(id) === index && catalog.data.some((m: any) => m.id === id && m.active !== false))
  if (!models.length) throw new Error(`No supported chat model is available in this Groq account. Configure ${modelEnv} with an accessible chat model.`)
  for (const model of models) {
    try { return await budgetedCompletion(groq,{...request, model}) }
    catch (error: any) {
      const code = error?.error?.error?.code || error?.error?.code || error?.code
      const message = error?.error?.error?.message || error?.error?.message || error?.message || ''
      const incompatible = error.status === 400 && /does not support chat completions/i.test(message)
      if (error.status !== 404 && !incompatible && !['model_not_found', 'model_permission_blocked', 'model_terms_required'].includes(code)) throw error
    }
  }
  throw new Error('Groq could not use any of the supported chat models. Check model permissions and required terms in your Groq project.')
}
