import { z } from 'zod'

export const COLOR_TOKENS = ['brand.primary', 'brand.secondary', 'brand.accent', 'brand.background', 'brand.textPrimary', 'brand.textSecondary', 'brand.onPrimary', 'brand.onAccent', 'brand.onImage', 'brand.overlay', 'transparent'] as const
export const FONT_TOKENS = ['brand.headingFont', 'brand.bodyFont'] as const
export const SLOT_NAMES = ['headline', 'body', 'cta', 'eyebrow', 'number', 'author', 'brand.name', 'brand.website', 'brand.logo', 'image.primary', 'step.1', 'step.2', 'step.3', 'step.4'] as const
export const VARIANT_ROLES = ['cover', 'content', 'image-content', 'list', 'quote', 'cta'] as const
const color = z.enum(COLOR_TOKENS)
const coord = z.number().finite().min(-4096).max(8192)
const size = z.number().finite().positive().max(8192)
const slotString = z.string().max(4000).refine(s => [...s.matchAll(/\{\{([^}]+)\}\}/g)].every(m => (SLOT_NAMES as readonly string[]).includes(m[1])), 'Unknown content slot')

// These are the existing Canvas node properties, with semantic values before resolution.
export const templateNodeSchema = z.object({
  id: z.string().min(1).max(100), type: z.enum(['text', 'shape', 'image', 'gradient']),
  x: coord, y: coord, width: size, height: size, rotation: z.number().min(-360).max(360).optional(),
  text: slotString.optional(), fontFamily: z.enum(FONT_TOKENS).optional(), fontSize: z.number().min(12).max(400).optional(),
  minFontSize: z.number().min(12).max(200).optional(), fontWeight: z.number().min(100).max(900).optional(),
  fontStyle: z.enum(['normal', 'italic']).optional(), textAlign: z.enum(['left', 'center', 'right']).optional(),
  lineHeight: z.number().min(.85).max(2).optional(), letterSpacing: z.number().min(-15).max(30).optional(),
  textTransform: z.enum(['none', 'uppercase', 'lowercase']).optional(), color: color.optional(),
  fill: color.optional(), stroke: color.optional(), strokeWidth: z.number().min(0).max(40).optional(),
  fillAlpha: z.number().min(0).max(100).optional(),
  shape: z.enum(['rect', 'ellipse']).optional(), borderRadius: z.number().min(0).max(4096).optional(),
  src: z.enum(['{{image.primary}}', '{{brand.logo}}']).optional(), objectFit: z.enum(['cover', 'contain']).optional(),
  cropLeft: z.number().min(0).max(90).optional(), cropRight: z.number().min(0).max(90).optional(),
  cropTop: z.number().min(0).max(90).optional(), cropBottom: z.number().min(0).max(90).optional(),
  filters: z.object({ brightness: z.number().min(0).max(200).optional(), contrast: z.number().min(0).max(200).optional(), saturate: z.number().min(0).max(200).optional(), opacity: z.number().min(0).max(100).optional() }).optional(),
  gradientType: z.enum(['linear', 'radial']).optional(), angle: z.number().min(0).max(360).optional(),
  stops: z.array(z.object({ color, position: z.number().min(0).max(100), alpha: z.number().min(0).max(100) })).min(2).max(8).optional(),
  highlight: z.enum(['none', 'color', 'background']).optional(),
  highlightCount: z.number().int().min(1).max(2).optional(),
  optional: z.boolean().optional(),
}).superRefine((node, ctx) => {
  if (node.type === 'text' && (!node.text || !node.fontFamily || !node.color || !node.fontSize)) ctx.addIssue({ code: 'custom', message: 'Text requires text, fontFamily, color and fontSize' })
  if (node.type === 'image' && !node.src) ctx.addIssue({ code: 'custom', message: 'Images must use image.primary or brand.logo slots' })
  if (node.type === 'gradient' && !node.stops) ctx.addIssue({ code: 'custom', message: 'Gradient requires stops' })
})
export const variantSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(80), name: z.string().min(1).max(80), role: z.enum(VARIANT_ROLES),
  background: color, nodes: z.array(templateNodeSchema).min(1).max(1600),
}).superRefine((v, ctx) => {
  if (new Set(v.nodes.map(n => n.id)).size !== v.nodes.length) ctx.addIssue({ code: 'custom', message: 'Node IDs must be unique within each variant' })
  if (!v.nodes.some(n => n.text?.includes('{{headline}}'))) ctx.addIssue({ code: 'custom', message: 'Every variant needs a headline slot' })
})
export const referenceSchema = z.object({ id: z.string().min(1).max(100), url: z.string().regex(/^\/(?:api\/uploads\/[a-zA-Z0-9-]+|design-references\/[a-zA-Z0-9_.-]+)$/), name: z.string().max(200), width: z.number().positive(), height: z.number().positive() })
export const familySchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/).max(100), schemaVersion: z.literal(1), version: z.number().int().positive(),
  name: z.string().trim().min(1).max(100), description: z.string().max(3000), tags: z.array(z.string().max(40)).max(12),
  width: z.number().int().min(320).max(4096), height: z.number().int().min(320).max(4096),
  typography: z.object({ headingFallback: z.string().max(80), bodyFallback: z.string().max(80) }),
  referenceStyle: z.object({
    primary: z.string().regex(/^#[a-fA-F0-9]{6}$/), secondary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    accent: z.string().regex(/^#[a-fA-F0-9]{6}$/), background: z.string().regex(/^#[a-fA-F0-9]{6}$/),
    textPrimary: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  }).optional(),
  referenceImages: z.array(referenceSchema).min(2).max(30),
  analysis: z.string().max(12000), variants: z.array(variantSchema).min(2).max(30),
}).superRefine((family, ctx) => {
  if (new Set(family.variants.map(v => v.id)).size !== family.variants.length) ctx.addIssue({ code: 'custom', message: 'Variant IDs must be unique' })
  if (!family.variants.some(v => v.role === 'cover') || !family.variants.some(v => v.role === 'content')) ctx.addIssue({ code: 'custom', message: 'A family needs cover and content variants' })
  for (const variant of family.variants) for (const node of variant.nodes) {
    if (node.type === 'text' && (node.x < 0 || node.y < 0 || node.x + node.width > family.width || node.y + node.height > family.height)) ctx.addIssue({ code: 'custom', message: `${variant.id}/${node.id}: text must stay inside the canvas` })
  }
  if (!family.variants.some(v => v.nodes.some(n => n.text?.includes('{{body}}')) && v.nodes.some(n => n.text?.includes('{{cta}}')))) ctx.addIssue({ code: 'custom', message: 'Include a content variant with body and CTA slots so supplied copy is preserved' })
})
export type TemplateNode = z.infer<typeof templateNodeSchema>
export type DesignVariant = z.infer<typeof variantSchema>
export type GlobalDesignFamily = z.infer<typeof familySchema>
export type ReferenceImage = z.infer<typeof referenceSchema>
export interface BrandGlobalDesign { id: string; source: 'global'; globalFamilyId: string; globalVersion: number; name: string; tags: string[]; createdAt: string }
export interface GlobalDesignRecord { id: string; status: 'draft' | 'published'; revision: number; draft: GlobalDesignFamily; publishedVersion?: number; deletedAt?: Date; updatedAt: Date }
