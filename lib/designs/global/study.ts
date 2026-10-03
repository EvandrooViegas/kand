import { z } from 'zod'
import { referenceSchema } from './types'

const prose = z.string().trim().min(1).max(1400)
const points = z.array(prose).min(1).max(12)
const level = z.enum(['low', 'medium', 'high'])

export const designDNASchema = z.object({
  personality: z.object({ keywords: z.array(z.string().min(2).max(60)).min(2).max(8), description: prose }),
  composition: z.object({ style: z.enum(['symmetric', 'asymmetric', 'mixed']), alignment: points, edgeUsage: level, description: prose }),
  density: z.object({ level, whitespaceStrategy: prose, description: prose }),
  typography: z.object({ headlineScale: z.enum(['small', 'medium', 'large', 'oversized']), hierarchy: prose, behavior: points, description: prose }),
  color: z.object({ strategy: prose, contrastStrategy: prose, accentUsage: prose, description: prose }),
  imagery: z.object({ role: prose, treatment: prose, description: prose }),
  decorativeLanguage: z.object({ elements: z.array(z.string().min(2).max(100)).max(12), behavior: prose, description: prose }),
  visualHierarchy: z.array(prose).min(3).max(6),
  distinctiveCharacteristics: z.array(prose).min(3).max(10),
  rules: z.array(prose).min(5).max(10),
  antiRules: z.array(prose).min(3).max(10),
  uncertainties: z.array(prose).max(8),
}).strict()

export const referenceStudySchema = z.object({
  referenceId: z.string(), dna: designDNASchema,
  evidence: z.array(z.object({ principle: prose, observation: prose })).min(3).max(8),
}).strict()

export const familyStudySchema = z.object({
  name: z.string().trim().min(3).max(100), dna: designDNASchema,
  sharedCharacteristics: z.array(z.object({ characteristic: prose, referenceIds: z.array(z.string()).min(2).max(30) })).max(12),
  differences: z.array(prose).min(1).max(12),
}).strict()

export const designStudySchema = z.object({
  schemaVersion: z.literal(1), name: z.string().trim().min(3).max(100),
  referenceImages: z.array(referenceSchema).min(1).max(30),
  designDNA: designDNASchema, referenceStudies: z.array(referenceStudySchema).min(1).max(30),
  sharedCharacteristics: familyStudySchema.shape.sharedCharacteristics,
  differences: familyStudySchema.shape.differences,
}).strict().superRefine((study, ctx) => {
  const ids = study.referenceImages.map(r => r.id)
  if (new Set(ids).size !== ids.length || study.referenceStudies.length !== ids.length || ids.some(id => study.referenceStudies.filter(r => r.referenceId === id).length !== 1)) ctx.addIssue({ code: 'custom', message: 'Every reference must have exactly one individual study.' })
  for (const item of study.sharedCharacteristics) {
    if (new Set(item.referenceIds).size !== ids.length || item.referenceIds.some(id => !ids.includes(id))) ctx.addIssue({ code: 'custom', message: 'Shared family characteristics must be supported by every reference.' })
  }
})
export type DesignDNA = z.infer<typeof designDNASchema>
export type DesignStudy = z.infer<typeof designStudySchema>

// The report is a deterministic view of the stored DNA, never a second AI response.
export function studyReportSections(dna: DesignDNA) {
  return [
    { title: 'Personality', items: [dna.personality.keywords.join(' · '), dna.personality.description] },
    { title: 'Composition', items: [dna.composition.description, `Balance: ${dna.composition.style}. Edge usage: ${dna.composition.edgeUsage}.`, ...dna.composition.alignment] },
    { title: 'Density & Whitespace', items: [`Density: ${dna.density.level}.`, dna.density.description, dna.density.whitespaceStrategy] },
    { title: 'Typography', items: [`Headline scale: ${dna.typography.headlineScale}.`, dna.typography.description, dna.typography.hierarchy, ...dna.typography.behavior] },
    { title: 'Color & Contrast', items: [dna.color.description, dna.color.strategy, dna.color.contrastStrategy, dna.color.accentUsage] },
    { title: 'Imagery', items: [dna.imagery.description, dna.imagery.role, dna.imagery.treatment] },
    { title: 'Decorative Language', items: [dna.decorativeLanguage.elements.join(' · ') || 'No recurring decorative marks observed.', dna.decorativeLanguage.description, dna.decorativeLanguage.behavior] },
    { title: 'Visual Hierarchy', items: dna.visualHierarchy, ordered: true },
    { title: 'Distinctive Characteristics', items: dna.distinctiveCharacteristics },
    { title: 'Design Rules', items: dna.rules, ordered: true },
    { title: 'Anti-Rules', items: dna.antiRules },
    { title: 'Uncertainties', items: dna.uncertainties },
  ].filter(section => section.items.length)
}
