import { LANGUAGE_NAMES, TONE_DESCS, MODEL_MAIN } from '../constants'
import { callGroq, extractJson } from './groqClient'

/**
 * Build consolidated brand profile for AI prompts
 * Single source of truth for "what the AI knows about the brand"
 */
export function buildBrandProfile(
  flow: any,
  opts: { extraDirectives?: string } = {}
): string {
  const brand = flow?.brandContext || {}
  const answers = flow?.brandAnswers || {}
  const questions = flow?.brandQuestions || []
  const extracted = flow?.extractedContext || ''
  const tone = flow?.tone || 'informative'
  const language = flow?.language || 'english'
  const languageName = LANGUAGE_NAMES[language] || 'English'
  const toneDesc = TONE_DESCS[tone] || TONE_DESCS.informative

  // Q&A block — high-value insider knowledge
  const qaLines = questions
    .map((q: string, i: number) => {
      const a = answers[i] || answers[String(i)]
      if (!a || !String(a).trim()) return null
      return `  • Q: ${q}\n    A: ${String(a).trim()}`
    })
    .filter(Boolean)

  const lines: string[] = []
  lines.push(`## BRAND PROFILE`)

  if (brand.businessName) lines.push(`- Business Name: ${brand.businessName}`)
  if (brand.description) lines.push(`- What they do: ${brand.description}`)
  if (brand.audience) lines.push(`- Target Audience: ${brand.audience}`)
  if (brand.voice) lines.push(`- Brand Voice / Personality: ${brand.voice}`)
  if (brand.instagram) lines.push(`- Instagram Handle: @${brand.instagram}`)
  if (brand.extra) lines.push(`- Additional Context: ${brand.extra}`)

  if (extracted && !brand.description) {
    const indented = extracted
      .split('\n')
      .map((l: string) => `    ${l}`)
      .join('\n')
    lines.push(`- Website Summary (auto-extracted):\n${indented}`)
  }

  if (qaLines.length > 0) {
    lines.push('')
    lines.push(`## STRATEGIC INSIGHTS (from the brand owner)`)
    lines.push(qaLines.join('\n'))
  }

  lines.push('')
  lines.push(`## STYLE DIRECTIVES`)
  lines.push(`- Language: write EVERYTHING in ${languageName}. Never use another language.`)
  lines.push(`- Tone: ${toneDesc}`)
  lines.push(`- No hashtags, no emojis, no markdown, no quotes wrapping the text.`)

  if (opts.extraDirectives) {
    lines.push(opts.extraDirectives)
  }

  return lines.join('\n')
}

/**
 * Convert canvas layout to human-readable visual description
 */
export function describeCanvasLayout(canvas: any, nodes: any[]): string {
  const W = canvas.width || 1080
  const H = canvas.height || 1080
  const orient = W > H ? 'landscape' : W < H ? 'portrait' : 'square'

  const zoneOf = (x: number, y: number, w: number, h: number): string => {
    const cx = x + w / 2
    const cy = y + h / 2
    const col = cx < W / 3 ? 'left' : cx > (2 * W) / 3 ? 'right' : 'center'
    const row = cy < H / 3 ? 'top' : cy > (2 * H) / 3 ? 'bottom' : 'middle'
    return `${row}-${col}`
  }

  const sortedNodes = [...(nodes || [])].sort((a, b) => (a.y || 0) - (b.y || 0))
  const layers: string[] = []

  for (const n of sortedNodes) {
    if (!n.dynamic_key) continue // Only describe dynamic slots

    const zone = zoneOf(n.x || 0, n.y || 0, n.width || 100, n.height || 40)

    if (n.type === 'image') {
      layers.push(
        `  • {${n.dynamic_key}} → IMAGE slot in ${zone} (${Math.round(n.width)}×${Math.round(n.height)}px)`
      )
    } else {
      const size = n.fontSize || 32
      const align = n.textAlign || 'left'
      const weight = n.fontWeight || 400
      const family = n.fontFamily || 'sans-serif'

      const role =
        size >= 72
          ? 'HERO HEADLINE'
          : size >= 48
          ? 'headline'
          : size >= 30
          ? 'sub-headline'
          : size >= 20
          ? 'body copy'
          : 'caption/small text'

      const weightLabel = weight >= 700 ? 'bold' : weight >= 500 ? 'medium' : 'regular'

      layers.push(
        `  • {${n.dynamic_key}} → TEXT ${role} in ${zone}, ${size}px ${weightLabel} ${family}, ${align}-aligned (box ${Math.round(n.width)}×${Math.round(n.height)}px)`
      )
    }
  }

  const lines: string[] = []
  lines.push(`## CANVAS LAYOUT — "${canvas.name}"`)

  const formatDesc =
    orient === 'square'
      ? '1:1 for Instagram feed'
      : orient === 'portrait'
      ? 'vertical for Reels/Stories vibe'
      : 'landscape'

  lines.push(`- Format: ${W}×${H} ${orient} (${formatDesc})`)

  if (canvas.background) {
    lines.push(
      `- Background: ${typeof canvas.background === 'string' ? canvas.background : 'custom'}`
    )
  }

  if (layers.length === 0) {
    lines.push(`- No dynamic slots in this layout.`)
  } else {
    lines.push(`- Dynamic slots (in reading order):`)
    lines.push(layers.join('\n'))
  }

  return lines.join('\n')
}

/**
 * Build context of recent posts to avoid repetition
 */
export function buildRecentPostsContext(existingPosts: any[], maxItems: number = 6): string {
  const recent = (existingPosts || [])
    .filter((p: any) => p.status !== 'deleted' && p.caption)
    .slice(-maxItems)

  if (recent.length === 0) return ''

  const lines: string[] = [
    `## POSTS ALREADY GENERATED (do NOT repeat these angles, hooks, or phrasing)`,
  ]

  recent.forEach((p: any, i: number) => {
    const cap = String(p.caption).slice(0, 140).replace(/\s+/g, ' ')
    lines.push(`  ${i + 1}. [${p.canvasType || 'single'}] "${cap}"`)
  })

  lines.push(`Every new post MUST take a fundamentally different angle from the ones above.`)

  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* ANGLE AXIS EXTRACTION                                               */
/* ------------------------------------------------------------------ */

/**
 * Generic fallback pool, used whenever extraction fails or returns too few
 * usable entries. Deliberately brand-agnostic — phrased as universal
 * commerce/service benefits so it's a sane default for ANY brand, not tuned
 * to any one client. Real batches should almost always get a brand-specific
 * pool from extractAngleAxes() instead; this only catches failure cases.
 */
export const FALLBACK_ANGLE_AXES = [
  'ease of getting started',
  'speed / how fast results come',
  'cost / price / affordability',
  'convenience — works from wherever you are',
  'no experience or skill required',
  'support — you are not doing it alone',
  'the specific outcome / transformation',
  'proof — real numbers, examples, results',
  'flexibility — fits around your life',
  'trust / reliability / who is behind it',
]

/**
 * Derive a fixed, brand-specific pool of concrete angles (distinct benefits,
 * pain points, features, or customer-journey moments) that copy for THIS
 * brand could each individually lead with. Works for any brand — it reads
 * whatever is in `brandProfile` (business name, description, audience, Q&A,
 * website summary, etc.) and asks the model to mine that specific content
 * for genuinely different angles, rather than using a generic list.
 *
 * Called ONCE per batch by the orchestrator (contentGenerator.ts) and the
 * resulting list is treated as a closed pool for that batch — same pattern
 * as COPY_ARCHETYPES in textGenerator.ts — so "pick a new angle" is enforced
 * by removing used options from the menu, not by asking the model to
 * self-judge novelty against free text.
 */
export async function extractAngleAxes(brandProfile: string, languageName: string): Promise<string[]> {
  const prompt = [
    `You are a marketing strategist. Based on the brand profile below, list 8-10 DISTINCT, CONCRETE`,
    `angles — benefits, pain points, features, or customer-journey moments — that ad copy for THIS`,
    `brand could each individually lead with. Each one must be a genuinely different underlying idea,`,
    `not the same benefit said a different way (e.g. "no inventory needed" and "skip the warehouse"`,
    `are the SAME angle — only include it once).`,
    ``,
    `Ground every angle in this specific brand's actual business, audience, and differentiators as`,
    `described below — do not fall back on generic marketing categories unless the profile genuinely`,
    `gives you nothing more specific to work with. A software tool, a restaurant, a clothing brand,`,
    `and a coaching business should each get a completely different-looking list.`,
    ``,
    brandProfile,
    ``,
    `## OUTPUT`,
    `Return ONLY valid JSON: {"angles": ["angle (3-6 words)", "angle (3-6 words)", ...]}`,
    `These are internal labels, not shown to end users — write them in English regardless of the`,
    `brand's output language (${languageName}).`,
  ].join('\n')

  try {
    const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.6, maxTokens: 400, jsonMode: true })
    const parsed = extractJson(raw, {}) || {}
    const angles = Array.isArray(parsed.angles)
      ? parsed.angles.map((a: any) => String(a).trim()).filter(Boolean)
      : []
    // Dedupe defensively — the model can still emit near-duplicates.
    const seen = new Set<string>()
    const deduped = angles.filter((a: string) => {
      const key = a.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return deduped.length >= 5 ? deduped : FALLBACK_ANGLE_AXES
  } catch (e) {
    console.error('Angle axis extraction failed:', (e as Error).message)
    return FALLBACK_ANGLE_AXES
  }
}