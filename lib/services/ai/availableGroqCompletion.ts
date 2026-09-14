import { budgetedModels, budgetedCompletion } from './requestBudget'
/** Use the account's live catalog; a listed model can still be access-restricted. */
export async function availableGroqCompletion(groq: any, request: any) {
  const catalog = await budgetedModels(groq)
  const preferred = [process.env.GROQ_BRAND_DESIGN_MODEL, 'openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant'].filter(Boolean)
  const models = preferred.filter((id, index) => preferred.indexOf(id) === index && catalog.data.some((m: any) => m.id === id && m.active !== false))
  if (!models.length) throw new Error('No supported chat model is available in this Groq account. Configure GROQ_BRAND_DESIGN_MODEL with an accessible chat model.')
  for (const model of models) {
    try { return await budgetedCompletion(groq,{...request, model}) }
    catch (error: any) {
      const code = error?.error?.error?.code || error?.error?.code || error?.code
      if (error.status !== 404 && code !== 'model_not_found' && code !== 'model_permission_blocked') throw error
    }
  }
  throw new Error('Groq denied access to the available design models. Check model permissions in your Groq project.')
}
