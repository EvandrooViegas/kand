/** Keep ordinary digits/letters while removing emoji presentation sequences. */
export function withoutEmoji(text: string): string {
  return text.replace(/([0-9#*])\uFE0F?\u20E3/gu, '$1')
    .replace(/[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\uFE0F\u200D\u20E3\u{E0020}-\u{E007F}]/gu, '')
    .replace(/[ \t]{2,}/g, ' ').trim()
}

export function cleanCopy(value: any): any {
  if (typeof value === 'string') return withoutEmoji(value)
  if (Array.isArray(value)) return value.map(cleanCopy)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, cleanCopy(child)]))
  return value
}
