export const carouselDebugEnabled = () => process.env.NODE_ENV === 'development' || process.env.CAROUSEL_INTERNAL_DEBUG === 'true'

/** One sanitizer for server logs and the optional debug response. Never log raw provider objects. */
export function sanitizeCarouselLog(value: unknown): any {
  const secrets = Object.entries(process.env).filter(([key, value]) => value && /key|token|secret|password|credential|cookie|database|mongo.*uri/i.test(key)).map(([, value]) => value!).sort((a, b) => b.length - a.length)
  const seen = new WeakSet<object>()
  const cleanString = (input: string) => {
    let result = input
    for (const secret of secrets) if (secret.length >= 4) result = result.split(secret).join('[REDACTED]')
    return result.replace(/data:image\/[^;]+;base64,[a-z0-9+/=\s]+/gi, '[IMAGE BYTES OMITTED]')
      .replace(/\bBearer\s+[^\s"',}]+/gi, 'Bearer [REDACTED]')
      .replace(/\b(?:sk-|gsk_)[a-zA-Z0-9_-]{8,}/g, '[REDACTED]')
      .replace(/(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql):\/\/[^\s"']+/gi, '[DATABASE URL REDACTED]')
      .replace(/https?:\/\/[^\s"<>]+/gi, raw => { try { const url = new URL(raw); url.username = ''; url.password = ''; if (url.search) url.search = '?redacted'; url.hash = ''; return url.toString() } catch { return '[URL REDACTED]' } })
      .replace(/\beyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\b/g, '[TOKEN REDACTED]')
      .replace(/((?:api[_-]?key|access[_-]?token|session[_-]?token|refresh[_-]?token|token|authorization|password|cookie|secret)["']?\s*[=:]\s*["']?)[^\s,;"'}]+/gi, '$1[REDACTED]')
  }
  const visit = (item: any): any => {
    if (typeof item === 'string') return cleanString(item)
    if (item === null || typeof item !== 'object') return item
    if (item instanceof Date) return item.toISOString()
    if (ArrayBuffer.isView(item)) return '[BINARY OMITTED]'
    if (seen.has(item)) return '[CIRCULAR]'
    seen.add(item)
    if (Array.isArray(item)) return item.map(visit)
    return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, /authorization|cookie|password|secret|credential|api.?key|access.?token|session.?token|refresh.?token|^token$|headers|b64_json|bytes/i.test(key) ? '[REDACTED]' : visit(child)]))
  }
  return visit(value)
}

export function logCarouselStage(runId: string, stage: string, status: string, metadata: Record<string, unknown> = {}, output?: unknown) {
  console.info(JSON.stringify(sanitizeCarouselLog({ runId, stage, timestamp: new Date(), status, ...metadata })))
  if (carouselDebugEnabled() && output !== undefined) console.info(`\n==================================================\n[${runId}] STAGE: ${stage}\n${JSON.stringify(sanitizeCarouselLog(output), null, 2)}\n==================================================`)
}

export function carouselFailure(error: any) {
  const providerStatusCode = Number(error?.status || error?.statusCode) || null
  return sanitizeCarouselLog({ errorName: error?.name || 'Error', errorMessage: String(error?.message || 'Unknown failure'), providerStatusCode,
    retryable: [408, 413, 429, 500, 502, 503, 504].includes(providerStatusCode || 0) || /timeout|fetch failed|ECONNRESET|ETIMEDOUT/i.test(String(error?.message)),
  })
}
