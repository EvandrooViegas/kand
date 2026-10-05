/**
 * The one output language for a brand's ideas and posts, and code-level checks that the model kept to it.
 * Brand profiles are researched and stored in English, so the language must be stated precisely and verified,
 * otherwise English wording (or the wrong regional variant) leaks into the copy.
 */
export interface ContentLanguage { name: string; code: string; label: string; rules: string }

const LANGUAGES: [RegExp, string, string][] = [
  [/^(pt|portug)/i, 'Portuguese', 'pt'], [/^(en|engl|ingl)/i, 'English', 'en'], [/^(es|span|espa)/i, 'Spanish', 'es'],
  [/^(fr|fren|fran)/i, 'French', 'fr'], [/^(de|germ|deut|alem)/i, 'German', 'de'], [/^(it|ital)/i, 'Italian', 'it'],
]

const hostOf = (website: any) => { try { return new URL(String(website)).hostname.toLowerCase() } catch { return String(website || '').toLowerCase() } }

const PT_PT = `European Portuguese (Portugal). Address the reader with "o seu/a sua" or the imperative, never "você". Use Portugal's vocabulary: equipa (not equipe/time), contacto (not contato), registo (not registro), telemóvel (not celular), utilizador (not usuário), ecrã (not tela), facto (not fato), objetivo/otimizar as in Portugal. Use "estar a + infinitivo" (estamos a trabalhar), never the gerund (estamos trabalhando).`
const PT_BR = `Brazilian Portuguese. Use Brazilian vocabulary and grammar (você, equipe, contato, celular, usuário; estamos trabalhando), never European forms (equipa, contacto, telemóvel, estar a + infinitivo).`

export function contentLanguage(brand: any = {}): ContentLanguage {
  const raw = String(brand.languageVariant || brand.language || '').trim()
  const match = LANGUAGES.find(([pattern]) => pattern.test(raw))
  const name = match?.[1] || (raw && raw.toLowerCase() !== 'unknown' ? raw : 'English')
  const host = hostOf(brand.website)
  const evidence = `${brand.about || ''} ${brand.targetAudience || ''}`
  let code = match?.[2] || 'en'
  // Explicit variants win; otherwise the site's country and the profile decide.
  if (code === 'pt') code = /pt-?br|brasil|brazil/i.test(raw) || host.endsWith('.br') || /\b(brasil|brazil|são paulo|rio de janeiro)\b/i.test(evidence) && !/\bportugal\b/i.test(evidence) ? 'pt-BR' : 'pt-PT'
  if (code === 'en') code = /en-?gb|british|uk\b/i.test(raw) || host.endsWith('.uk') ? 'en-GB' : 'en-US'
  if (code === 'es') code = /es-?es|spain|españa/i.test(raw) || host.endsWith('.es') ? 'es-ES' : 'es'
  const label = code === 'pt-PT' ? 'Portuguese — European (pt-PT)' : code === 'pt-BR' ? 'Portuguese — Brazilian (pt-BR)' : code === 'en-GB' ? 'English — British (en-GB)' : code === 'en-US' ? 'English — American (en-US)' : `${name} (${code})`
  const variant = code === 'pt-PT' ? PT_PT : code === 'pt-BR' ? PT_BR : code === 'en-GB' ? 'British spelling (organise, colour, centre).' : ''
  const english = code.startsWith('en')
  const rules = `OUTPUT LANGUAGE: ${label}.
Write every reader-facing word in ${label}: topics, hooks, messages, headlines, body text, CTAs, captions and hashtags. ${variant}
${english ? '' : `The brand profile is English research notes: use it only for facts and translate every idea from it; never copy its English sentences, service descriptions or CTA wording. Keep only proper nouns, brand and product names (e.g. Facebook Ads, TikTok, LinkedIn) and standard acronyms (SEO, ROI) unchanged. Translate English marketing jargon when a natural ${name} term exists (engagement, leads, insights, tips, call to action).
`}Never mix languages or regional variants inside one post. Exception: design.image.subject and design.image.queries are internal stock-search terms and stay in English.`
  return { name, code, label, rules }
}

// High-precision English function words; none of them is a word in the other supported languages.
const ENGLISH = new Set(['the', 'and', 'your', 'you', 'with', 'for', 'our', 'this', 'that', 'how', 'why', 'what', 'from', 'more', 'will', 'can', 'get', 'into', 'are', 'is', 'of', 'to', 'we', 'they', 'their', 'about', 'just', 'now', 'learn', 'discover', 'business', 'today'])
// English marketing jargon the rules ask to translate; one occurrence is already a mixed-language post.
const JARGON = new Set(['leads', 'insights', 'engagement', 'tips', 'boost', 'unlock', 'growth'])
// \b is ASCII-only in JavaScript, so word edges are Unicode letter lookarounds (accented words like "você").
const BRAZILIAN = /(?<!\p{L})(você|vocês|equipe|celular|contato|registro|usuários?|ônibus|a gente)(?!\p{L})|(?<!\p{L})(estou|está|estamos|estão|esteja)\s+\p{L}+ndo(?!\p{L})/giu
const EUROPEAN = /(?<!\p{L})(equipa|telemóvel|contacto|registo|utilizadores?|ecrã)(?!\p{L})|(?<!\p{L})(estou|está|estamos|estão)\s+a\s+\p{L}+(ar|er|ir)(?!\p{L})/giu

/** Reader-facing problems with the language of generated text. Empty when the text is consistent. */
export function languageIssues(texts: string[], language: ContentLanguage): string[] {
  const text = texts.filter(t => typeof t === 'string').join('\n')
  if (!text.trim()) return []
  const issues: string[] = []
  if (!language.code.startsWith('en')) {
    const words = text.toLowerCase().match(/\p{L}+/gu) || []
    const english = words.filter(w => ENGLISH.has(w)), jargon = words.filter(w => JARGON.has(w))
    if (jargon.length || english.length >= 3 || (words.length >= 12 && english.length / words.length > .05)) issues.push(`contains English wording (${[...new Set([...jargon, ...english])].slice(0, 6).join(', ')}); write it entirely in ${language.label}`)
  }
  const wrong = language.code === 'pt-PT' ? text.match(BRAZILIAN) : language.code === 'pt-BR' ? text.match(EUROPEAN) : null
  if (wrong?.length) issues.push(`uses ${language.code === 'pt-PT' ? 'Brazilian' : 'European'} Portuguese forms (${[...new Set(wrong.map(w => w.toLowerCase()))].slice(0, 5).join(', ')}); use ${language.label} consistently`)
  return issues
}

/** Reader-facing strings of a copy object (never internal design or search fields). */
export function copyTexts(copy: any): string[] {
  if (!copy || typeof copy !== 'object') return []
  const slides = Array.isArray(copy.slides) ? copy.slides : []
  return [copy.headline, copy.subheadline, copy.supportingText, copy.cta, copy.caption,
    ...slides.flatMap((s: any) => [s?.headline, s?.body, s?.cta])].filter((t: any) => typeof t === 'string')
}
