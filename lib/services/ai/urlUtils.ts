/**
 * URL normalization utilities
 */

export function normalizeUrl(url: string): string {
  let normalized = url.trim()

  if (
    !normalized.startsWith('http://') &&
    !normalized.startsWith('https://')
  ) {
    normalized = `https://${normalized}`
  }

  return normalized.replace(/\/$/, '')
}
