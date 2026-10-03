import { z } from 'zod'
import { DesignLibraryError } from './store'
import { designStudySchema } from './study'

const copyText = z.preprocess(value => value == null ? '' : value, z.string())
const copySchema = z.object({ slides: z.array(z.object({ headline: copyText, body: copyText, cta: copyText, bullets: z.array(z.string()).optional() }).passthrough()).min(2).max(20), cta: copyText }).passthrough()
export function brandCarouselContent(input: unknown) {
  const copy = copySchema.parse(input)
  return copy.slides.map((slide, index) => {
    const text = [slide.headline, slide.body, ...(slide.bullets || []), slide.cta || (index === copy.slides.length - 1 ? copy.cta : '')].filter(Boolean).join('\n')
    if (!text.trim()) throw new DesignLibraryError(`Slide ${index + 1} has no copy.`)
    return `Slide ${index + 1}\n${text}`
  }).join('\n\n')
}

export async function resolveBrandStudy(db: any, flowId: string, designId: string) {
  const flow = await db.collection('flows').findOne({ id: flowId })
  if (!flow) throw new DesignLibraryError('Brand not found.', 404)
  const design = flow.brandContext?.designs?.find((d: any) => d.id === designId && d.source === 'study')
  if (!design) throw new DesignLibraryError('Select an identity from this brand’s design library.', 400)
  const snapshot = await db.collection('brandDesignStudies').findOne({ _id: design.studySnapshotId, flowId })
  if (!snapshot) throw new DesignLibraryError('The saved brand identity is unavailable. Add it to the brand again.', 409)
  return { design, study: designStudySchema.parse(snapshot.study), brandName: flow.brandContext.name || '' }
}

/** Store generated artwork in the existing carousel/gallery format, one image node per slide. */
export async function persistBrandCarousel(db: any, brandPost: any, result: any) {
  const id = result.id
  const canvas = { id, flowId: brandPost.flowId, name: brandPost.name, type: 'carousel', width: 1080, height: 1350, background: '#ffffff', nodes: [], groups: [], classes: {},
    pages: result.slides.map((slide: any, index: number) => ({ id: `${id}-page-${index + 1}`, name: `Slide ${index + 1}`, order: index, type: index === 0 ? 'top_peer' : index === result.slides.length - 1 ? 'bottom_peer' : 'content', width: 1080, height: 1350, background: '#ffffff', groups: [], classes: {},
      nodes: [{ id: `${id}-image-${index + 1}`, type: 'image', x: 0, y: 0, width: 1080, height: 1350, src: slide.url, rotation: 0, opacity: 1, visible: true, locked: false }],
    })),
    designSelection: brandPost.design, generationRunId: id, generationSource: 'design-study', sourceCopy: brandPost.copy, createdAt: new Date(), updatedAt: new Date(),
  }
  await db.collection('canvases').updateOne({ id }, { $setOnInsert: canvas }, { upsert: true })
  const saved = await db.collection('canvases').findOne({ id })
  const { _id, ...value } = saved
  return value
}
