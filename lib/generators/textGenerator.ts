/**
 * AI Text Generation for canvas posts
 * Generates copy for single images and carousel pages
 *
 * CHANGES vs previous version:
 * 1. COPY_ARCHETYPES — named structural patterns (hook/aphorism, transformation+CTA,
 *    old-way-vs-new-way comparison, objection flip, proof/number lead).
 * 2. detectFieldGroups() — clusters text fields by x/y position into "columns" so
 *    side-by-side comparison layouts get filled item-for-item.
 * 3. Localized craft rules — PT-leaning cliché ban list, brand-name-in-copy rule.
 * 4. DIVERSITY, now field-level not just headline-level. Every real field value
 *    gets tracked in `diversity.usedLines`, and no post may reuse a 3+ word
 *    phrase from any prior post's fields.
 * 5. ANGLE POOL (new). Archetype diversity works because COPY_ARCHETYPES is a
 *    closed, enumerable list — once one is used it's physically removed from
 *    what's offered, so the model can't repeat it no matter how it phrases
 *    things. Angle diversity used to be free text ("pick something new, here's
 *    what's been used") which the model could satisfy by rewording the SAME
 *    underlying idea (e.g. "sell without inventory" → "no stock to manage" →
 *    "flexibility without upfront stock") — lexically fresh, semantically a
 *    repeat, and nothing caught it. Angle selection now works exactly like
 *    archetype selection: `extractAngleAxes()` (in brandContext.ts) derives a
 *    brand-specific closed pool of angles ONCE per batch, and each post must
 *    pick verbatim from whatever remains in that pool. Once an angle is
 *    consumed it's off the menu — there's no phrasing clever enough to select
 *    an option that isn't offered.
 * 6. Diversity bookkeeping lives IN these functions, not the orchestrator.
 *    Pass the same `diversity` object into every call across the whole batch —
 *    each function reads what's already used to build its constraints, then
 *    writes its own results back before returning.
 * 7. REGISTER POOL (new). Archetype controls STRUCTURE and angle controls
 *    TOPIC, but neither controls DELIVERY VOICE — a philosophical one-liner,
 *    a blunt imperative, a provocative question, and a stat-first line can
 *    all use different archetypes and different angles and still read as
 *    "the same kind of post" if they're all delivered the same way. REGISTER_MODES
 *    is a small, generic (brand-agnostic — no extraction call needed) closed
 *    pool, consumed the same way as archetypes: once used, removed from what's
 *    offered. Combined with archetype + angle this gives three independent
 *    axes of forced variety instead of two.
 * 8. Opening-word check. Two headlines can pass every rule above and still
 *    both start with the same word ("Comece hoje..." / "Comece a vender...").
 *    `usedOpeningWords` tracks the first word of each post's hero/headline
 *    field and the model is told not to reuse it.
 */

import { callGroq, extractJson } from '@/lib/services/ai/groqClient'
import { buildBrandProfile, describeCanvasLayout, FALLBACK_ANGLE_AXES } from '@/lib/services/ai/brandContext'
import { LANGUAGE_NAMES, MODEL_MAIN } from '@/lib/services/constants'

/* ------------------------------------------------------------------ */
/* COPY ARCHETYPES                                                     */
/* ------------------------------------------------------------------ */

const COPY_ARCHETYPES = [
  {
    id: 'aphorism_hook',
    use_when: 'ONE hero headline + ONE short subtext. No bullet/column groups.',
    pattern:
      `A short, quotable, near-philosophical line built on a contrast (waiting vs acting, ` +
      `comfort vs growth, doubt vs starting). It should work standalone, screenshotted, no ` +
      `logo needed. Subtext converts the feeling into one concrete action: imperative verb + ` +
      `brand name + the exact thing they can now do.`,
    example_shape: `"[Contrarian truth about hesitation]." / "[Imperative verb] on [Brand] and [concrete outcome]."`,
  },
  {
    id: 'transformation_cta',
    use_when: 'Hero headline + subtext, plus a supporting proof field (screenshot/price/plan).',
    pattern:
      `Imperative headline promising a before/after transformation in the reader's life ` +
      `(time → money, idea → income, chaos → order). Subtext gives ONE concrete mechanism for ` +
      `how — naming the brand and naming the specific friction it removes (pulled from the ` +
      `brand's actual differentiators, not a generic one).`,
    example_shape: `"[Imperative verb] and turn your [resource] into [result]" / "[Concrete access line] with [Brand]."`,
  },
  {
    id: 'comparison_contrast',
    use_when: 'TWO symmetric field groups (left/right columns, before/after, old way/new way).',
    pattern:
      `A blunt "old way vs new way" structure. Title names both sides in 2-4 words each. Each ` +
      `bullet is 1-4 words — noun phrases, not sentences — and the two columns mirror each ` +
      `other item-for-item (row 1 left is the problem row 1 right solves, etc).`,
    example_shape: `Title: "[Old thing] VS [New thing]". Left col = limits of the old way. Right col = the mirrored benefit, same order.`,
  },
  {
    id: 'objection_flip',
    use_when: 'Hero headline + subtext, and brand context implies a common doubt (no money, no time, no experience).',
    pattern:
      `Headline names the exact excuse the reader is silently telling themselves, then flips ` +
      `it in the same breath. Subtext removes that specific objection by naming what the brand ` +
      `handles instead.`,
    example_shape: `"[Objection], but [flip]." / "[Brand] handles [the worry] — you just [the one thing they do]."`,
  },
  {
    id: 'proof_number',
    use_when: 'A micro/short hero field (fits a number or few words) + one supporting line.',
    pattern:
      `Leads with one hard, specific number (price, days, %, count) that reframes the offer as ` +
      `low-risk and concrete. Supporting line translates that number into a plain-English benefit.`,
    example_shape: `"[Number/stat]" / "[What that number gets you, in plain terms]."`,
  },
]

/* ------------------------------------------------------------------ */
/* REGISTER MODES — delivery voice, independent of archetype & angle   */
/* ------------------------------------------------------------------ */

const REGISTER_MODES = [
  {
    id: 'provocative_question',
    desc: `Open the hero/headline field with a direct question aimed at the reader — something that puts them on the spot. No statement first, no rhetorical throat-clearing before it.`,
  },
  {
    id: 'blunt_statement',
    desc: `Open the hero/headline field with a flat, declarative claim stated as fact — no question mark, no "you", no softening. It should read like a conclusion, not an invitation.`,
  },
  {
    id: 'imperative_command',
    desc: `Open the hero/headline field with a command verb aimed straight at the reader (start / stop / do X). Direct address, present tense, no throat-clearing before the verb.`,
  },
  {
    id: 'stat_or_number_lead',
    desc: `Open the hero/headline field with a concrete number, price, timeframe, or count before any explanation follows. The number itself is the hook.`,
  },
  {
    id: 'scene_or_moment',
    desc: `Open the hero/headline field by naming a specific, relatable moment or scene the reader has lived through (a time of day, a feeling, a situation) rather than an abstract claim about the brand.`,
  },
]

function availableRegisters(used: string[] = []) {
  const remaining = REGISTER_MODES.filter((r) => !used.includes(r.id))
  return remaining.length ? remaining : REGISTER_MODES
}

function buildRegisterBlock(available: typeof REGISTER_MODES) {
  return [
    `## DELIVERY REGISTER (only these are offered for this post — others already used earlier in this batch are withheld)`,
    `Archetype controls STRUCTURE and angle controls TOPIC — this controls VOICE: how the hero/headline field is actually delivered. Choose exactly one and follow its instruction literally when writing that field. State your choice in "_register" (id only).`,
    ...available.map((r) => `- ${r.id} — ${r.desc}`),
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* CRAFT PRINCIPLES                                                    */
/* ------------------------------------------------------------------ */

const IG_PRINCIPLES = [
  `## INSTAGRAM CRAFT PRINCIPLES (obey all of these)`,
  `1. PICK AN ARCHETYPE FIRST. Look at the field groups below, choose the ONE archetype from the library that fits the shape you've been given, and execute it fully. Do not blend two archetypes.`,
  `2. HOOK FIRST. The very first line/headline must stop the scroll — pattern break, contrarian claim, or naming the exact reader's situation.`,
  `3. SPECIFIC > VAGUE. Concrete nouns, numbers, tangible outcomes. Never filler like "amazing", "next level", "game-changer" — or their equivalents in the target language ("incrível", "revolucionário", "solução completa").`,
  `4. ONE IDEA per post. Do not stuff. Pick a single sharp angle and commit to it across every field.`,
  `5. WRITE LIKE A HUMAN, NOT A BROCHURE. Contractions where natural. Short sentences. Direct address to the reader. In Portuguese-language brands, default to imperative commands ("Entra", "Começa", "Aproveita") unless brandProfile specifies a more formal register.`,
  `6. NAME THE BRAND INSIDE THE COPY, not just the logo. At least one field (usually the subtext/CTA line) should mention the brand name doing the concrete action.`,
  `7. NO CORPORATE MUSH. Ban words: "unlock", "elevate", "empower", "unleash", "seamless", "revolutionary", "cutting-edge", "solutions", "leverage", "synergy" — and equivalents in the output language.`,
  `8. NO EMOJIS, NO HASHTAGS in the on-canvas text.`,
  `9. RESPECT WORD LIMITS STRICTLY. A field with "6 words max" MUST have ≤ 6 words. Comparison-column bullets are almost always 1-4 words — noun phrases, not sentences.`,
  `10. DIVERSIFY EVERY FIELD, NOT JUST THE HEADLINE. A post can have a fresh-sounding headline and still be a repeat if the subtext/secondary field says the same thing as a prior post. Every field in this post — headline, subtext, footer, bullets, everything — must be new content, not a recycled line from an earlier post in the batch, even if it "technically" still fits.`,
  `11. THE ANGLE POOL BELOW CONTROLS TOPIC, NOT JUST STRUCTURE. Archetype is HOW the copy is shaped. Angle is WHICH underlying benefit/pain/feature/moment you're talking about. Pick your angle strictly from the pool offered — do not substitute a different phrasing of an angle that isn't offered, and do not default to whatever the brand's tagline says verbatim just because it's the most obvious thing in the brand profile.`,
  `12. THE REGISTER BELOW CONTROLS VOICE. Archetype + angle can be different from every prior post and still feel like the same post if it's delivered the same way every time (always a command, always upbeat). Follow the chosen register's instruction literally for the hero/headline field specifically — that's the field readers see first and it's what actually reads as "different."`,
  `13. NEVER OPEN THE HERO/HEADLINE FIELD WITH A WORD ALREADY USED TO OPEN A PRIOR POST IN THIS BATCH (see constraints below). If your first instinct repeats one, pick a different first word even if it means restructuring the sentence.`,
].join('\n')

/**
 * Context accumulated across a batch so each new post/caption is forced away
 * from what's already been generated. Create ONE of these per batch and pass
 * the SAME object into every call (single-image, carousel pages, captions) —
 * each function reads what's already used to build its constraints, then
 * pushes its own results back onto these arrays before returning. You do NOT
 * need to manually extract headlines/archetypes/angles in your orchestrator;
 * these functions do it themselves.
 *
 * `angleCategories` should be set ONCE by the orchestrator, before the first
 * call, using `extractAngleAxes()` from brandContext.ts (brand-specific) or
 * left unset to fall back to FALLBACK_ANGLE_AXES (generic).
 *
 * This only works if posts are generated sequentially (await one at a time).
 * If your loop uses Promise.all to fire multiple generations in parallel,
 * every call reads the SAME snapshot of `diversity` and none of them see each
 * other's output — they'll independently converge on the same "safe" answer.
 */
export interface DiversityContext {
  usedArchetypes?: string[]
  angleCategories?: string[] // fixed pool for this batch — set ONCE by the orchestrator (extractAngleAxes)
  usedAngleCategories?: string[] // which pool entries have been consumed so far in this batch
  usedAngles?: string[] // free-text elaborations of the chosen category, kept for readability/logging only
  usedRegisters?: string[] // which REGISTER_MODES ids have been consumed so far in this batch
  usedOpeningWords?: string[] // first word of each post's hero/headline field so far in this batch
  usedLines?: string[] // every real field value generated so far in this batch, across ALL fields
  usedCaptionOpenings?: string[]
}

function ensureDiversityArrays(diversity?: DiversityContext) {
  if (!diversity) return
  diversity.usedArchetypes = diversity.usedArchetypes || []
  diversity.angleCategories = diversity.angleCategories && diversity.angleCategories.length
    ? diversity.angleCategories
    : FALLBACK_ANGLE_AXES
  diversity.usedAngleCategories = diversity.usedAngleCategories || []
  diversity.usedAngles = diversity.usedAngles || []
  diversity.usedRegisters = diversity.usedRegisters || []
  diversity.usedOpeningWords = diversity.usedOpeningWords || []
  diversity.usedLines = diversity.usedLines || []
  diversity.usedCaptionOpenings = diversity.usedCaptionOpenings || []
}

// Removes already-used archetypes from the pool entirely — the model can't
// pick what it isn't shown. Resets once every archetype has been used so a
// large batch doesn't run out of options.
function availableArchetypes(used: string[] = []) {
  const remaining = COPY_ARCHETYPES.filter((a) => !used.includes(a.id))
  return remaining.length ? remaining : COPY_ARCHETYPES
}

function buildArchetypeBlock(available: typeof COPY_ARCHETYPES) {
  return [
    `## COPY ARCHETYPE LIBRARY (only these are offered for this post — any others were already used earlier in this batch and are intentionally withheld)`,
    `Choose exactly one that fits the field groups for this post. State your choice in the "_archetype" field of your JSON output (id only).`,
    ...available.map((a) => `- ${a.id} — use when: ${a.use_when}\n  Pattern: ${a.pattern}\n  Shape: ${a.example_shape}`),
  ].join('\n')
}

// Same trick as availableArchetypes: physically remove consumed angles from
// what's offered so the model literally cannot select a repeat, regardless
// of how cleverly it might reword it. Resets once the whole pool is used up
// so a large batch doesn't run out of options (rare in practice — batches
// are 3 posts, pools are 8-10 entries).
function availableAngleCategories(pool: string[] = FALLBACK_ANGLE_AXES, used: string[] = []) {
  const remaining = pool.filter((a) => !used.includes(a))
  return remaining.length ? remaining : pool
}

function buildAngleCategoryBlock(available: string[]) {
  return [
    `## ANGLE POOL (only these remain available for this post — the rest were already used earlier in this batch and are intentionally withheld)`,
    `Choose exactly ONE as the core idea this post leads with. Copy the chosen angle VERBATIM into "_angleCategory" — do not reword or paraphrase it. Then use "_angle" for a 3-6 word note on how you're applying that angle to this specific post (this part can be your own words).`,
    ...available.map((a) => `- ${a}`),
  ].join('\n')
}

// Lists prior archetypes/lines verbatim so the model has something concrete to
// diverge from — "be diverse" alone is too vague to act on. Angle repetition
// is now prevented structurally (see availableAngleCategories) rather than
// through a free-text listing here, since that's what let semantically
// identical angles slip through as "new" phrasing before.
function buildDiversityBlock(diversity?: DiversityContext): string {
  if (!diversity) return ''
  const lines: string[] = []
  if (diversity.usedArchetypes?.length) {
    lines.push(
      `- Archetypes already used earlier in this batch: ${diversity.usedArchetypes.join(
        ', '
      )}. These are removed from the library above — do not try to use them anyway.`
    )
  }
  if (diversity.usedOpeningWords?.length) {
    lines.push(
      `- First words already used to open the hero/headline field earlier in this batch: ${diversity.usedOpeningWords
        .map((w) => `"${w}"`)
        .join(', ')}. Do not open your hero/headline field with any of these words.`
    )
  }
  if (diversity.usedLines?.length) {
    lines.push(`- Exact lines already used earlier in this batch, in ANY field (do not reuse, reorder, or lightly reword any of these):`)
    diversity.usedLines.forEach((l) => lines.push(`    "${l}"`))
    lines.push(
      `  If a line you're about to write shares 3 or more consecutive words with any line above, or makes the same ` +
        `claim in different words, rewrite it. This applies to EVERY field you write, not just the headline.`
    )
  }
  if (!lines.length) return ''
  return [`## HARD DIVERSITY CONSTRAINTS`, ...lines].join('\n')
}

// Call after parsing a successful generation to record what was used, so the
// NEXT call in this batch sees it. Mutates `diversity` in place.
function recordUsage(
  diversity: DiversityContext | undefined,
  archetype: string,
  angleCategory: string | null,
  angleElaboration: string | null,
  register: string | null,
  heroOpeningWord: string | null,
  fieldValues: string[]
) {
  if (!diversity) return
  ensureDiversityArrays(diversity)
  if (archetype) diversity.usedArchetypes!.push(archetype)
  if (angleCategory) diversity.usedAngleCategories!.push(angleCategory)
  if (angleElaboration) diversity.usedAngles!.push(angleElaboration)
  if (register) diversity.usedRegisters!.push(register)
  if (heroOpeningWord) diversity.usedOpeningWords!.push(heroOpeningWord)
  for (const v of fieldValues) {
    if (v && v.trim()) diversity.usedLines!.push(v.trim())
  }
}

// Picks the field most likely to be the visible "hero" line — highest-priority
// role wins (HERO headline > headline > sub-headline > ...), falling back to
// the first field if nothing is tagged. Used only to pull the opening word for
// the anti-repeat check; doesn't affect which fields actually get written.
function findHeroKey(meta: { key: string; role: string }[]): string | null {
  const priority = ['HERO headline', 'headline', 'sub-headline', 'body copy', 'caption/micro-text']
  for (const role of priority) {
    const hit = meta.find((m) => m.role === role)
    if (hit) return hit.key
  }
  return meta[0]?.key || null
}

function firstWord(text: string | undefined): string | null {
  if (!text) return null
  const w = String(text).trim().split(/\s+/)[0]
  return w ? w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') : null
}

/* ------------------------------------------------------------------ */
/* FIELD METADATA (unchanged sizing logic)                             */
/* ------------------------------------------------------------------ */

function computeFieldMeta(allNodes: any[], k: string) {
  const node = allNodes.find((n: any) => n.dynamic_key === k && n.type === 'text')
  if (!node) return { key: k, hint: 'short text', maxWords: 8, sizeCategory: 'short', role: 'body' }

  const fs = Math.max(12, node.fontSize || 48)
  const w = Math.max(50, node.width || 200)
  const h = Math.max(30, node.height || 100)
  const lineHeight = Math.max(1.0, node.lineHeight || 1.2)
  const fontWidthRatio = fs <= 20 ? 0.54 : fs <= 32 ? 0.53 : fs <= 48 ? 0.52 : 0.51
  const avgCharWidth = fs * fontWidthRatio
  const containerPadding = Math.max(8, fs * 0.15)
  const effectiveWidth = w - containerPadding * 2
  const charsPerLine = Math.max(3, Math.floor(effectiveWidth / avgCharWidth))
  const lineSpaceNeeded = fs * lineHeight
  const verticalPadding = Math.max(4, fs * 0.25)
  const effectiveHeight = h - verticalPadding * 2
  const availableLines = Math.max(1, Math.floor(effectiveHeight / lineSpaceNeeded))
  const avgCharsPerWord = 5.5
  const maxChars = charsPerLine * availableLines
  let maxWords = Math.max(2, Math.round(maxChars / avgCharsPerWord))
  let sizeCategory = 'medium'

  if (h < 40) {
    maxWords = Math.min(maxWords, 4)
    sizeCategory = 'micro'
  } else if (h < 80) {
    maxWords = Math.min(maxWords, 10)
    sizeCategory = 'short'
  } else if (h < 200) {
    maxWords = Math.max(8, Math.min(maxWords, 30))
    sizeCategory = 'medium'
  } else if (h < 400) {
    maxWords = Math.max(25, maxWords)
    sizeCategory = 'large'
  } else {
    maxWords = Math.max(50, maxWords)
    sizeCategory = 'extra-large'
  }

  const role =
    fs >= 72 ? 'HERO headline' : fs >= 48 ? 'headline' : fs >= 30 ? 'sub-headline' : fs >= 20 ? 'body copy' : 'caption/micro-text'

  return { key: k, hint: `${maxWords} words max (${sizeCategory} — ${role})`, maxWords, sizeCategory, role }
}

/* ------------------------------------------------------------------ */
/* FIELD GROUP DETECTION                                               */
/* ------------------------------------------------------------------ */

interface FieldGroup {
  label: string
  keys: string[]
}

function detectFieldGroups(nodes: any[], keys: string[]): FieldGroup[] {
  const withPos = keys
    .map((k) => {
      const n = nodes.find((n: any) => n.dynamic_key === k && n.type === 'text')
      return n && typeof n.x === 'number' && typeof n.y === 'number' ? { key: k, x: n.x, y: n.y } : null
    })
    .filter(Boolean) as { key: string; x: number; y: number }[]

  if (withPos.length < 4) return []

  const xs = [...withPos.map((n) => n.x)].sort((a, b) => a - b)
  const mid = xs[Math.floor(xs.length / 2)]
  const left = withPos.filter((n) => n.x < mid)
  const right = withPos.filter((n) => n.x >= mid)

  if (left.length >= 2 && right.length >= 2 && Math.abs(left.length - right.length) <= 2) {
    return [
      { label: 'LEFT COLUMN (top→bottom)', keys: left.sort((a, b) => a.y - b.y).map((n) => n.key) },
      { label: 'RIGHT COLUMN (top→bottom)', keys: right.sort((a, b) => a.y - b.y).map((n) => n.key) },
    ]
  }
  return []
}

function buildGroupsBlock(nodes: any[], keys: string[]): string {
  const groups = detectFieldGroups(nodes, keys)
  if (!groups.length) return ''
  return [
    `## DETECTED FIELD GROUPS — this layout is a side-by-side comparison`,
    `Write these two lists item-for-item: row 1 left should set up what row 1 right resolves, and so on. Use the "comparison_contrast" archetype.`,
    ...groups.map((g) => `${g.label}: ${g.keys.join(', ')}`),
  ].join('\n')
}

/* ------------------------------------------------------------------ */
/* SINGLE IMAGE                                                        */
/* ------------------------------------------------------------------ */

export async function generateSingleImageCopy(
  canvas: any,
  textKeys: string[],
  allNodes: any[],
  postIndex: number,
  brandProfile: string,
  recentPostsCtx: string,
  languageName: string,
  diversity?: DiversityContext
): Promise<Record<string, string>> {
  const unique = [...new Set(textKeys)]
  if (unique.length === 0) return {}

  const meta = unique.map((k) => computeFieldMeta(allNodes, k))
  const layoutDesc = describeCanvasLayout(canvas, allNodes)
  const groupsBlock = buildGroupsBlock(allNodes, unique)

  const available = availableArchetypes(diversity?.usedArchetypes)
  const archetypeBlock = buildArchetypeBlock(available)

  const anglePool = diversity?.angleCategories?.length ? diversity.angleCategories : FALLBACK_ANGLE_AXES
  const availableAngles = availableAngleCategories(anglePool, diversity?.usedAngleCategories)
  const angleCategoryBlock = buildAngleCategoryBlock(availableAngles)

  const availableRegs = availableRegisters(diversity?.usedRegisters)
  const registerBlock = buildRegisterBlock(availableRegs)

  const heroKey = findHeroKey(meta)
  const diversityBlock = buildDiversityBlock(diversity)

  const prompt = [
    `You are a world-class Instagram copywriter. Write the on-canvas text for ONE single-image post.`,
    ``,
    brandProfile,
    ``,
    layoutDesc,
    groupsBlock,
    ``,
    IG_PRINCIPLES,
    ``,
    archetypeBlock,
    angleCategoryBlock,
    registerBlock,
    diversityBlock,
    recentPostsCtx,
    ``,
    `## THIS POST (post #${postIndex + 1} in the batch)`,
    `- Angle: choose ONE entry from the ANGLE POOL above — copy it verbatim into "_angleCategory". Do not invent your own or default to the brand's tagline even if it fits; the pool already reflects this brand's actual differentiators.`,
    `- Register: choose ONE entry from the DELIVERY REGISTER above — copy it verbatim into "_register" and apply its instruction literally to the "${heroKey}" field specifically.`,
    `- Format: SINGLE image (not a carousel). Everything visible at once. No "swipe", no "next slide", no "part 1".`,
    `- All fields must combine into ONE cohesive story: hook → substance → resolution (or CTA).`,
    ``,
    `## FIELDS TO FILL (name → word budget & role)`,
    meta.map((m) => `  • ${m.key} → ${m.hint}`).join('\n'),
    ``,
    `## OUTPUT`,
    `Return ONLY a valid JSON object. Include "_archetype" (id, from the library above ONLY), "_angleCategory" (verbatim, from the pool above ONLY), "_angle" (3-6 words on how you're applying that angle to this post), "_register" (id, from the delivery register above ONLY), and "_avatar" (3-6 words on who this post is speaking to) as extra keys — discarded before rendering, but every real field below MUST also be present and correct.`,
    `{"_archetype":"...","_angleCategory":"...","_angle":"...","_register":"...","_avatar":"...",${meta.map((m) => `"${m.key}":"..."`).join(',')}}`,
    `Write all real field values in ${languageName}.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.9, maxTokens: 700, jsonMode: true })
    const parsed = extractJson(raw, {}) || {}
    const result: Record<string, string> = {}
    for (const m of meta) {
      const v = parsed[m.key]
      result[m.key] = v && String(v).trim() ? String(v).trim() : 'Something worth stopping for.'
    }
    const archetype = available.some((a) => a.id === parsed._archetype) ? parsed._archetype : available[0].id
    const angleCategory = availableAngles.includes(parsed._angleCategory) ? parsed._angleCategory : availableAngles[0]
    const angle = parsed._angle && String(parsed._angle).trim() ? String(parsed._angle).trim() : null
    const register = availableRegs.some((r) => r.id === parsed._register) ? parsed._register : availableRegs[0].id
    const openingWord = heroKey ? firstWord(result[heroKey]) : null

    recordUsage(diversity, archetype, angleCategory, angle, register, openingWord, meta.map((m) => result[m.key]))

    // Not real canvas fields — strip before mapping `result` onto canvas nodes.
    result._archetype = archetype
    return result
  } catch (e) {
    console.error('Single-image generation failed:', (e as Error).message)
    const result: Record<string, string> = {}
    for (const m of meta) result[m.key] = 'Something worth stopping for.'
    result._archetype = available[0]?.id || ''
    return result
  }
}

/* ------------------------------------------------------------------ */
/* CAROUSEL PAGE                                                       */
/* ------------------------------------------------------------------ */

export async function generateCarouselPageCopy(
  canvas: any,
  textKeys: string[],
  pageNodes: any[],
  pageType: 'top_peer' | 'content' | 'bottom_peer',
  totalPages: number,
  pageIdx: number,
  postIndex: number,
  hookContent: Record<string, string> | null,
  brandProfile: string,
  recentPostsCtx: string,
  languageName: string,
  diversity?: DiversityContext
): Promise<Record<string, string>> {
  const unique = [...new Set(textKeys)]
  if (unique.length === 0) return {}

  const meta = unique.map((k) => computeFieldMeta(pageNodes, k))
  const layoutDesc = describeCanvasLayout({ ...canvas, name: `${canvas.name} — page ${pageIdx + 1}/${totalPages}` }, pageNodes)
  const groupsBlock = buildGroupsBlock(pageNodes, unique)

  const available = availableArchetypes(diversity?.usedArchetypes)
  const archetypeBlock = buildArchetypeBlock(available)

  const anglePool = diversity?.angleCategories?.length ? diversity.angleCategories : FALLBACK_ANGLE_AXES
  const availableAngles = availableAngleCategories(anglePool, diversity?.usedAngleCategories)
  const angleCategoryBlock = buildAngleCategoryBlock(availableAngles)

  const availableRegs = availableRegisters(diversity?.usedRegisters)
  const registerBlock = buildRegisterBlock(availableRegs)
  const heroKey = findHeroKey(meta)

  const diversityBlock = buildDiversityBlock(diversity)

  let roleBlock = ''
  let hookRef = ''

  if (pageType === 'top_peer') {
    roleBlock = [
      `## PAGE ROLE — HOOK (page 1 of ${totalPages})`,
      `- Job: stop the scroll and make people SWIPE. Nothing else.`,
      `- Reveal a curiosity gap, contrarian claim, or naming a pain the reader recognizes.`,
      `- Do NOT list the tips/steps. Tease them. The full value is on the next pages.`,
      `- Best-fit archetypes here: aphorism_hook, objection_flip, proof_number.`,
    ].join('\n')
  } else if (pageType === 'bottom_peer') {
    roleBlock = [
      `## PAGE ROLE — CALL TO ACTION (page ${totalPages} of ${totalPages})`,
      `- Job: convert attention into ONE clear next step.`,
      `- Options: comment a word, save the post, DM a keyword, tap the link, follow, share.`,
      `- Be specific. "Learn more" is banned.`,
      `- Name the brand doing the action, per craft rule 6.`,
    ].join('\n')
    if (hookContent && Object.keys(hookContent).length > 0) {
      hookRef = `\n## HOOK FROM PAGE 1 (tie the CTA back to it)\n${Object.entries(hookContent)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')}`
    }
  } else {
    roleBlock = [
      `## PAGE ROLE — CONTENT (page ${pageIdx + 1} of ${totalPages})`,
      `- Job: deliver the PROMISE made by page 1. Give the concrete value, proof, or story.`,
      `- Bring NEW information. Do NOT paraphrase the hook.`,
      `- Every sentence has to justify itself. If a sentence adds nothing, cut it.`,
      `- If field groups are detected below, this page is likely a comparison_contrast — treat both columns as one unit.`,
    ].join('\n')
    if (hookContent && Object.keys(hookContent).length > 0) {
      hookRef = `\n## HOOK YOU MUST EXPAND (from page 1)\n${Object.entries(hookContent)
        .filter(([k]) => !k.startsWith('_'))
        .map(([k, v]) => `  ${k}: ${v}`)
        .join('\n')}\nYour task: deliver on this promise with fresh, specific content.`
    }
  }

  const prompt = [
    `You are a world-class Instagram carousel copywriter. Write the on-canvas text for ONE page of a carousel.`,
    ``,
    brandProfile,
    ``,
    layoutDesc,
    groupsBlock,
    ``,
    IG_PRINCIPLES,
    ``,
    archetypeBlock,
    angleCategoryBlock,
    registerBlock,
    diversityBlock,
    recentPostsCtx,
    ``,
    roleBlock,
    hookRef,
    ``,
    `## THIS POST (carousel post #${postIndex + 1} in the batch)`,
    `- Angle: choose ONE entry from the ANGLE POOL above — copy it verbatim into "_angleCategory". This applies to the whole carousel post, not per-page — if this is page 2+ of the same post, stay consistent with the angle chosen on page 1 where hookContent is provided.`,
    `- Register: choose ONE entry from the DELIVERY REGISTER above — copy it verbatim into "_register" and apply it to the "${heroKey}" field on this page. On page 1 (the hook) this is the most important field to get right; on later pages stay consistent with whatever page 1 chose where hookContent is provided.`,
    ``,
    `## FIELDS TO FILL (name → word budget & role)`,
    meta.map((m) => `  • ${m.key} → ${m.hint}`).join('\n'),
    ``,
    `## OUTPUT`,
    `Return ONLY a valid JSON object. Include "_archetype" (from the library above ONLY), "_angleCategory" (verbatim, from the pool above ONLY), "_angle" (3-6 words on how you're applying it), and "_register" (id, from the delivery register above ONLY) as extra keys — discarded before rendering. Every real field below MUST also be present and correct, written in ${languageName}.`,
    `{"_archetype":"...","_angleCategory":"...","_angle":"...","_register":"...",${meta.map((m) => `"${m.key}":"..."`).join(',')}}`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const raw = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.9, maxTokens: 650, jsonMode: true })
    const parsed = extractJson(raw, {}) || {}
    const result: Record<string, string> = {}
    for (const m of meta) {
      const v = parsed[m.key]
      result[m.key] =
        v && String(v).trim()
          ? String(v).trim()
          : pageType === 'top_peer'
          ? 'The one thing everyone gets wrong'
          : pageType === 'bottom_peer'
          ? 'Save this for later'
          : 'Here is what actually works'
    }
    const archetype = available.some((a) => a.id === parsed._archetype) ? parsed._archetype : available[0].id
    const angleCategory = availableAngles.includes(parsed._angleCategory) ? parsed._angleCategory : availableAngles[0]
    const angle = parsed._angle && String(parsed._angle).trim() ? String(parsed._angle).trim() : null
    const register = availableRegs.some((r) => r.id === parsed._register) ? parsed._register : availableRegs[0].id
    const openingWord = heroKey ? firstWord(result[heroKey]) : null

    // For content/bottom_peer pages that are continuing a hook, don't double
    // consume the pool for the same post — only record a NEW angle/register
    // consumption when this page actually introduced one (i.e. no hookContent
    // was passed, meaning this page is the one establishing the post's angle
    // and voice — normally the top_peer/hook page).
    const shouldRecordPoolUsage = !hookContent
    recordUsage(
      diversity,
      archetype,
      shouldRecordPoolUsage ? angleCategory : null,
      angle,
      shouldRecordPoolUsage ? register : null,
      shouldRecordPoolUsage ? openingWord : null,
      meta.map((m) => result[m.key])
    )

    result._archetype = archetype
    return result
  } catch (e) {
    console.error('Carousel page generation failed:', (e as Error).message)
    const result: Record<string, string> = {}
    for (const m of meta) {
      result[m.key] =
        pageType === 'top_peer'
          ? 'The one thing everyone gets wrong'
          : pageType === 'bottom_peer'
          ? 'Save this for later'
          : 'Here is what actually works'
    }
    result._archetype = available[0]?.id || ''
    return result
  }
}

/* ------------------------------------------------------------------ */
/* CAPTION                                                              */
/* ------------------------------------------------------------------ */

export async function generateCaption(
  textValues: Record<string, string>,
  brandProfile: string,
  languageName: string,
  diversity?: DiversityContext
): Promise<string> {
  const contentSummary = Object.entries(textValues || {})
    .filter(([k, v]) => !k.startsWith('_') && typeof v === 'string' && v.length > 0)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')

  const usedOpenings = diversity?.usedCaptionOpenings || []
  const diversityBlock = usedOpenings.length
    ? [
        `## CAPTIONS ALREADY USED IN THIS BATCH — do not reuse their opening line, structure, or CTA verb`,
        ...usedOpenings.map((c) => `  - "${c}"`),
        `Open with a different word and lead with a different fact, benefit, or emotion than every caption above. If your first sentence would start the same way as one of these, rewrite it. Two captions that both say "start your business with ease, let [Brand] handle X" are the same caption even with a different final sentence — vary the whole thing, not just the CTA.`,
      ].join('\n')
    : ''

  const prompt = [
    `You are writing the Instagram CAPTION that will accompany a post whose on-image copy is already written.`,
    ``,
    brandProfile,
    ``,
    `## ON-IMAGE COPY (already written — the caption must complement, NOT repeat, it)`,
    contentSummary,
    ``,
    diversityBlock,
    ``,
    `## RULES`,
    `- Language: ${languageName} only.`,
    `- 1 to 3 sentences (max ~220 characters total).`,
    `- Open with a hook different from the image headline AND different from any caption already used in this batch.`,
    `- End with a soft CTA (comment / save / share) OR a punchy line — depending on tone. Vary which CTA you use across the batch; don't default to the same one every time.`,
    `- No hashtags, no emojis, no quotes around the caption, no clichés ("incrível", "não percas mais tempo", "solução completa", "descubra o poder de").`,
    `- Return the caption text ONLY, no preamble.`,
  ]
    .filter(Boolean)
    .join('\n')

  try {
    const caption = await callGroq({ prompt, model: MODEL_MAIN, temperature: 0.85, maxTokens: 160 })
    const clean = caption.replace(/^["']|["']$/g, '').trim() || 'Worth a second look.'
    if (diversity) {
      ensureDiversityArrays(diversity)
      diversity.usedCaptionOpenings!.push(clean)
    }
    return clean
  } catch (e) {
    console.error('Caption generation error:', (e as Error).message)
    return 'Worth a second look.'
  }
}