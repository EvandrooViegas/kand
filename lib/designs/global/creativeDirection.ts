import { z } from 'zod'
import { designStudySchema } from './study'

const text = z.string().trim().min(1).max(1800)
const optionalCopy = z.preprocess(value => value === '' || value === undefined ? null : value, z.string().max(4000).nullable())
export const postBriefSchema = z.object({
  platform: z.literal('instagram').default('instagram'),
  format: z.enum(['feed-post', 'portrait-post', 'story', 'carousel-cover']).default('portrait-post'),
  topic: z.string().trim().max(1000).default(''),
  objective: z.enum(['awareness', 'education', 'engagement', 'promotion', 'announcement', 'conversion', 'other']).default('awareness'),
  headline: optionalCopy, supportingText: optionalCopy, cta: optionalCopy,
  imageDirection: optionalCopy, additionalInstructions: optionalCopy,
}).strict().refine(b => !!(b.topic || b.headline?.trim() || b.supportingText?.trim()), 'Provide a topic, headline or supporting text.')
export type PostBrief = z.infer<typeof postBriefSchema>

export const identityInterpretationSchema = z.object({
  characteristics: z.array(z.object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    domain: z.enum(['brand', 'composition', 'motif']),
    strength: z.enum(['CORE', 'STRONG', 'OPTIONAL', 'REFERENCE_SPECIFIC', 'UNCERTAIN']),
    characteristic: text, rationale: text,
    evidence: z.array(z.object({ sourceId: z.string(), quote: text.optional() })).max(60),
  }).strict()).min(1).max(24),
  antiPatterns: z.array(z.object({ characteristic: text, rationale: text, evidence: z.array(z.object({ sourceId: z.string(), quote: text.optional() })).min(1).max(60) }).strict()).max(10),
  uncertainties: z.array(text).max(12),
}).strict()
export type IdentityInterpretation = z.infer<typeof identityInterpretationSchema>

// Stable evidence IDs make strength decisions inspectable, including for old studies.
export function studyEvidence(input: unknown) {
  const study = designStudySchema.parse(input)
  const evidence: { id: string; referenceId: string | null; path: string; text: string; uncertain: boolean }[] = []
  const visit = (value: any, prefix: string, referenceId: string | null, path = '') => {
    if (typeof value === 'string') evidence.push({ id: `${prefix}.${path}`, referenceId, path, text: value, uncertain: path.startsWith('uncertainties') })
    else if (value && typeof value === 'object') for (const [key, item] of Object.entries(value)) visit(item, prefix, referenceId, path ? `${path}.${key}` : key)
  }
  study.referenceStudies.forEach((ref, index) => visit(ref.dna, `r${index + 1}`, ref.referenceId))
  visit(study.designDNA, 'family', null)
  study.differences.forEach((value, index) => evidence.push({ id: `difference.${index}`, referenceId: null, path: 'differences', text: value, uncertain: false }))
  return { study, evidence }
}

export function validateInterpretation(raw: unknown, input: unknown) {
  const value = identityInterpretationSchema.parse(raw)
  const { study, evidence } = studyEvidence(input)
  const sources = new Map(evidence.map(item => [item.id, item]))
  if (new Set(value.characteristics.map(c => c.id)).size !== value.characteristics.length) throw Error('Characteristic IDs must be unique.')
  const check = (items: { sourceId: string; quote?: string }[]) => items.map(item => {
    const source = sources.get(item.sourceId)
    if (!source || (item.quote !== undefined && !source.text.includes(item.quote))) throw Error(`Evidence ${item.sourceId} must quote the actual study text.`)
    item.quote = source.text
    return source
  })
  for (const item of value.characteristics) {
    const cited = check(item.evidence)
    const refs = new Set(cited.filter(s => s.referenceId && !s.uncertain && !s.path.startsWith('antiRules')).map(s => s.referenceId))
    const cap = (strength: typeof item.strength, reason: string) => {
      if (item.strength !== strength) { item.strength = strength; item.rationale = `${reason} ${item.rationale}`.slice(0, 1800) }
    }
    // Model confidence is a proposal. Evidence sets the maximum strength.
    if (!refs.size || cited.some(s => s.uncertain)) cap('UNCERTAIN', 'Insufficient reliable individual evidence; not a generation requirement.')
    if (item.strength === 'CORE' && item.domain === 'motif') cap('OPTIONAL', 'Reusable motif, not mandatory identity.')
    if (item.strength === 'CORE' && /\b(photograph(?:y|s|ic)?|photos?|imagery|images?)\b/i.test(item.characteristic)) cap('STRONG', 'Imagery-related observations are flexible; this post can still omit imagery.')
    if (item.strength === 'CORE' && (refs.size < 2 || refs.size !== study.referenceImages.length)) cap(refs.size >= 2 ? 'STRONG' : 'REFERENCE_SPECIFIC', 'Not supported across every reference.')
    if (item.strength === 'STRONG' && refs.size < 2) cap('REFERENCE_SPECIFIC', 'Only one reference supports this observation.')
    if (item.strength === 'REFERENCE_SPECIFIC' && refs.size > 1) cap('OPTIONAL', 'Compatible across references, but not mandatory.')
    if (['CORE', 'STRONG'].includes(item.strength) && /\b(always|never|every pixel|sole permitted)\b/i.test(item.characteristic)) cap('UNCERTAIN', 'Over-absolute wording requires review before it can constrain a post.')
  }
  value.antiPatterns = value.antiPatterns.filter(item => {
    const cited = check(item.evidence)
    return !cited.some(source => source.uncertain) && new Set(cited.filter(source => source.referenceId).map(source => source.referenceId)).size >= 2
  })
  return value
}

const nullableText = text.nullable()
const level = z.enum(['low', 'medium', 'high'])
export const creativeDirectionSchema = z.object({
  concept: text, rationale: text,
  canvas: z.object({ platform: z.literal('instagram'), format: postBriefSchema.innerType().shape.format, aspectRatio: text, recommendedSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }) }),
  content: z.object({ headline: z.string().nullable(), supportingText: z.string().nullable(), cta: z.string().nullable(), hierarchy: z.array(z.object({ element: z.enum(['headline', 'supportingText', 'cta', 'imagery', 'branding']), priority: z.number().int().min(1).max(5), treatment: text })).max(5) }),
  composition: z.object({ layoutType: text, alignment: text, focalPoint: text, headlinePosition: nullableText, supportingTextPosition: nullableText, ctaPosition: nullableText, brandingPosition: text, visualPosition: nullableText, negativeSpace: level, density: level, description: text }),
  typography: z.object({ headlineStyle: nullableText, supportingStyle: nullableText, ctaStyle: nullableText, emphasisStrategy: text, hierarchyDescription: text }),
  colors: z.object({ background: text, primaryText: text, secondaryText: text, accent: text, usageRules: z.array(text).min(1).max(10), contextualImagePolicy: text }),
  imagery: z.object({ useImagery: z.boolean(), subject: nullableText, style: nullableText, crop: nullableText, angle: nullableText, integration: nullableText }),
  motifs: z.object({ selected: z.array(z.object({ characteristicId: z.string(), motif: text, reason: text })).max(3), rejected: z.array(z.object({ characteristicId: z.string(), motif: text, reason: text })).max(24) }),
  appliedPrinciples: z.array(z.object({ characteristicId: z.string(), application: text })).max(24),
  brandConsistency: z.object({ coreCharacteristics: z.array(text).max(24), strongTendenciesUsed: z.array(text).max(24), optionalCharacteristicsUsed: z.array(text).max(24) }),
  avoid: z.array(text).max(16), generationNotes: z.array(text).max(16), missingInformation: z.array(text).max(10),
}).strict()
export type CreativeDirection = z.infer<typeof creativeDirectionSchema>
export function directionCanvas(format: PostBrief['format']) {
  const height = format === 'story' ? 1920 : format === 'feed-post' ? 1080 : 1350
  return { platform: 'instagram' as const, format, aspectRatio: height === 1920 ? '9:16' : height === 1080 ? '1:1' : '4:5', recommendedSize: { width: 1080, height } }
}

export function validateCreativeDirection(raw: unknown, brief: PostBrief, identity: IdentityInterpretation) {
  const normalized: any = structuredClone(raw)
  // No secondary copy needs a separate color. Reuse the chosen primary-text color
  // rather than spending another model request on redundant palette bookkeeping.
  if (normalized?.colors?.secondaryText === null && brief.supportingText === null) normalized.colors.secondaryText = normalized.colors.primaryText
  // No metadata copy exists in PostBrief. Do not turn reference corner labels
  // into an invented content requirement when the model lists that role.
  if (Array.isArray(normalized?.content?.hierarchy)) normalized.content.hierarchy = normalized.content.hierarchy.filter((item: any) => item.element !== 'metadata')
  const value = creativeDirectionSchema.parse(normalized)
  const supplied = JSON.stringify(brief)
  const factualTokens = JSON.stringify(value).match(/https?:\/\/[^\s"\\]+|www\.[^\s"\\]+|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|[$€£]\s?\d[\d.,]*/g) || []
  if (factualTokens.some(token => !supplied.includes(token))) throw Error('Do not introduce an unsupported URL, contact or price anywhere in the plan.')
  if (JSON.stringify(value.canvas) !== JSON.stringify(directionCanvas(brief.format))) throw Error('Use the requested format and its supplied canvas specification.')
  for (const field of ['headline', 'supportingText', 'cta'] as const) {
    if (value.content[field] !== brief[field]) throw Error(`Preserve supplied ${field} verbatim, or null when absent. Do not invent copy or facts.`)
    if (brief[field] === null && value.content.hierarchy.some(item => item.element === field)) throw Error(`Missing ${field} cannot appear in the content hierarchy.`)
    const position = field === 'supportingText' ? 'supportingTextPosition' : `${field}Position` as 'headlinePosition' | 'ctaPosition'
    const style = field === 'supportingText' ? 'supportingStyle' : `${field}Style` as 'headlineStyle' | 'ctaStyle'
    if (brief[field] === null && (value.composition[position] !== null || value.typography[style] !== null)) throw Error(`Missing ${field} must have null position and style.`)
    if (brief[field] !== null && !value.content.hierarchy.some(item => item.element === field)) throw Error(`Supplied ${field} needs an explicit hierarchy treatment.`)
  }
  const hierarchy = value.content.hierarchy
  if (new Set(hierarchy.map(h => h.element)).size !== hierarchy.length || new Set(hierarchy.map(h => h.priority)).size !== hierarchy.length) throw Error('Each hierarchy element and priority must be unique.')
  if (!value.imagery.useImagery && (Object.entries(value.imagery).some(([k, v]) => k !== 'useImagery' && v !== null) || value.composition.visualPosition !== null || hierarchy.some(h => h.element === 'imagery'))) throw Error('Disabled imagery must have null visual specifications and no visual hierarchy entry.')
  if (value.imagery.useImagery && (!value.imagery.subject || !value.imagery.integration || !value.composition.visualPosition)) throw Error('Enabled imagery requires subject, integration and placement decisions.')
  const characteristics = new Map(identity.characteristics.map(c => [c.id, c]))
  const applied = new Set(value.appliedPrinciples.map(p => p.characteristicId))
  if (applied.size !== value.appliedPrinciples.length) throw Error('Apply each principle once.')
  for (const id of applied) if (!characteristics.has(id) || characteristics.get(id)!.strength === 'UNCERTAIN') throw Error('Uncertain or unknown characteristics cannot be generation requirements.')
  const core = identity.characteristics.filter(c => c.strength === 'CORE')
  if (core.some(c => !applied.has(c.id))) throw Error('Preserve every supported core identity characteristic and explain its application.')
  const selections = [...value.motifs.selected, ...value.motifs.rejected]
  if (new Set(selections.map(m => m.characteristicId)).size !== selections.length) throw Error('A motif cannot be both selected and rejected.')
  for (const motif of selections) if (characteristics.get(motif.characteristicId)?.domain !== 'motif') throw Error('Motifs must come from the interpreted reusable vocabulary.')
  for (const motif of value.motifs.selected) {
    if (characteristics.get(motif.characteristicId)!.strength === 'UNCERTAIN') throw Error('Uncertain motifs cannot become generation requirements.')
    // Selection already states the application reason; avoid duplicate model bookkeeping.
    if (!applied.has(motif.characteristicId)) {
      applied.add(motif.characteristicId)
      value.appliedPrinciples.push({ characteristicId: motif.characteristicId, application: motif.reason })
    }
  }
  for (const motif of value.motifs.rejected) if (applied.has(motif.characteristicId)) throw Error('Rejected motifs cannot be applied principles.')
  // These lists are derived from evidence-backed IDs, not free-form model assertions.
  value.brandConsistency = {
    coreCharacteristics: core.map(c => c.characteristic),
    strongTendenciesUsed: identity.characteristics.filter(c => c.strength === 'STRONG' && applied.has(c.id)).map(c => c.characteristic),
    optionalCharacteristicsUsed: identity.characteristics.filter(c => ['OPTIONAL', 'REFERENCE_SPECIFIC'].includes(c.strength) && applied.has(c.id)).map(c => c.characteristic),
  }
  return value
}
