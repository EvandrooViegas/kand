/**
 * Chooses what the next idea is about, in code, so a brand's ideas explore its whole profile instead of
 * circling one subject. Each idea pairs the least-used content pillar with the least-covered part of the
 * brand (a service, project, differentiator, researched topic or the company itself). No model call.
 */
export const PILLARS = ['Educational', 'Expertise', 'Services', 'Projects / Cases', 'Company', 'Behind the scenes', 'Industry insights', 'Problems and solutions', 'Trust / Credibility', 'Brand positioning'] as const
type FacetKind = 'service' | 'project' | 'differentiator' | 'topic' | 'company'
export interface Facet { kind: FacetKind; label: string; detail: string }
export interface PastIdea { topic?: string; pillar?: string; format?: string; angle?: { pillar?: string; facet?: string } }
export interface Angle { pillar: string; facet: Facet; format: 'single' | 'carousel' }

// Which parts of the brand each pillar can be built on.
const PILLAR_FACETS: Record<string, FacetKind[]> = {
  Educational: ['topic', 'service'], Expertise: ['service', 'differentiator'], Services: ['service'], 'Projects / Cases': ['project'],
  Company: ['company', 'differentiator'], 'Behind the scenes': ['service', 'project'], 'Industry insights': ['topic', 'service'],
  'Problems and solutions': ['service', 'topic'], 'Trust / Credibility': ['differentiator', 'project'], 'Brand positioning': ['differentiator', 'company'],
}

const text = (value: any) => typeof value === 'string' ? value.trim() : ''
const list = (value: any): any[] => Array.isArray(value) ? value : []

/** The distinct things this brand can talk about, from its saved profile. */
export function brandFacets(brand: any = {}): Facet[] {
  const named = (value: string) => { const [label, ...rest] = value.split(/\s+[—–-]\s+/); return { label: label.slice(0, 90), detail: (rest.join(' — ') || value).slice(0, 300) } }
  const facets: Facet[] = [
    ...list(brand.services).map(text).filter(Boolean).map(s => ({ kind: 'service' as const, ...named(s) })),
    ...list(brand.projects).map((p: any) => typeof p === 'string' ? named(p) : { label: text(p?.name).slice(0, 90), detail: text(p?.description).slice(0, 300) }).filter(p => p.label).map(p => ({ kind: 'project' as const, ...p })),
    ...list(brand.differentiators).map(text).filter(Boolean).map(d => ({ kind: 'differentiator' as const, label: d.slice(0, 90), detail: d.slice(0, 300) })),
    ...list(brand.contentTopics).map(text).filter(Boolean).map(t => ({ kind: 'topic' as const, label: t.slice(0, 90), detail: t.slice(0, 300) })),
  ]
  if (text(brand.about)) facets.push({ kind: 'company', label: 'The company itself: story, values and way of working', detail: text(brand.about).slice(0, 400) })
  return facets
}

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const significant = (value: string) => new Set((fold(value).match(/[a-z0-9]{4,}/g) || []))
/** Shared distinctive words; proper nouns (Facebook, TikTok, project names) survive translation. */
function mentions(topic: string, facet: Facet) {
  const words = significant(topic)
  const names = (facet.label.match(/\b[A-Z][\w-]*[A-Z]?[\w-]*/g) || []).map(fold).filter(n => n.length >= 3 && !['the', 'and', 'how', 'why', 'what'].includes(n))
  if (names.some(n => words.has(n) || fold(topic).includes(n))) return true
  return [...significant(facet.label)].filter(w => words.has(w)).length >= 2
}

/** Topic overlap between two ideas written in the same language (0..1). */
export function topicSimilarity(a: string, b: string) {
  const x = significant(a), y = significant(b)
  if (!x.size || !y.size) return 0
  const shared = [...x].filter(w => y.has(w)).length
  return shared / (x.size + y.size - shared)
}

export function chooseAngle(brand: any, history: PastIdea[], random = Math.random): Angle | null {
  const facets = brandFacets(brand)
  if (!facets.length) return null
  const recent = history.slice(0, 12)
  const pick = <T,>(items: T[], score: (item: T) => number) => {
    const best = Math.min(...items.map(score))
    const ties = items.filter(item => score(item) === best)
    return ties[Math.floor(random() * ties.length) % ties.length]
  }
  const pillars = PILLARS.filter(p => facets.some(f => PILLAR_FACETS[p].includes(f.kind)))
  const pillarOf = (idea: PastIdea) => idea.angle?.pillar || idea.pillar || ''
  // The least-used pillar recently; never the same pillar twice in a row when another is available.
  const pillar = pick(pillars.filter(p => pillars.length < 2 || p !== pillarOf(history[0] || {})), p => recent.filter(i => pillarOf(i) === p).length)
  const usage = (facet: Facet) => history.filter(i => i.angle?.facet ? i.angle.facet === facet.label : mentions(String(i.topic || ''), facet)).length
  const facet = pick(facets.filter(f => PILLAR_FACETS[pillar].includes(f.kind)), usage)
  const formats = recent.slice(0, 6).map(i => i.format)
  const format = formats.filter(f => f === 'carousel').length > formats.filter(f => f === 'single').length + 1 ? 'single' : 'carousel'
  return { pillar, facet, format }
}

/** Merges idea history from the client and the saved flow, newest first, one entry per topic. */
export function ideaHistory(...sources: any[][]): PastIdea[] {
  const seen = new Set<string>(), out: PastIdea[] = []
  for (const source of sources) for (const item of list(source)) {
    const idea: PastIdea = typeof item === 'string' ? { topic: item } : item && typeof item === 'object' ? { topic: text(item.topic), pillar: text(item.pillar), format: text(item.format), angle: item.angle && typeof item.angle === 'object' ? { pillar: text(item.angle.pillar), facet: text(item.angle.facet) } : undefined } : {}
    const key = fold(idea.topic || '')
    if (!key || seen.has(key)) continue
    seen.add(key); out.push(idea)
  }
  return out.slice(0, 40)
}
