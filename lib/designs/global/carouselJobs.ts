import { persistBrandCarousel } from './brandCarousel'
import { createHash, randomUUID } from 'node:crypto'
import { carouselInputSchema, explicitSlides, contentAnalysisSchema, generatedSlideSchema, analyzeCarouselContent, directCarousel, createCarouselVisualSystem, createSlideSpec, buildGenerationPrompt, CAROUSEL_CANVAS } from './carousel'
import { analyzeDesignStudy } from './studyAnalysis'
import { designStudySchema } from './study'
import { getDesignStudy, DesignLibraryError } from './store'
import { interpretDesignStudy } from './creativeDirector'
import { generateCarouselSlide } from './carouselImages'
import { carouselDebugEnabled, sanitizeCarouselLog, logCarouselStage, carouselFailure } from './carouselLogging'

const runners = (globalThis as any).__carouselRunners ||= new Map<string, Promise<void>>()
const collection = (db: any) => db.collection('globalCarouselRuns')
const services = { analyzeDesignStudy, interpretDesignStudy, analyzeCarouselContent, directCarousel, createCarouselVisualSystem, createSlideSpec, buildGenerationPrompt, generateCarouselSlide }

export async function createCarouselRun(db: any, raw: any, context?: { savedStudy: unknown; brandPost: any }) {
  const { requestId, ...body } = raw
  const input = carouselInputSchema.parse(body)
  const id = requestId || `carousel_${randomUUID()}`
  if (typeof id !== 'string' || !/^carousel_[a-zA-Z0-9-]{1,100}$/.test(id)) throw new DesignLibraryError('Invalid generation request ID.')
  const explicit = explicitSlides(input.carouselContent)
  if (explicit) contentAnalysisSchema.parse({ explicitBoundaries: true, slides: explicit.map((text, index) => ({ slideNumber: index + 1, text })) })
  if (!process.env.OPENAI_API_KEY) throw new DesignLibraryError('Configure OPENAI_API_KEY for carousel image generation.', 503)
  // Snapshot saved DNA at creation: editing/deleting the study later cannot change an in-flight run.
  const savedStudy = context ? designStudySchema.parse(context.savedStudy) : input.studyId ? designStudySchema.parse((await getDesignStudy(db, input.studyId)).study) : undefined
  const inputHash = createHash('sha256').update(JSON.stringify(context ? { input, flowId: context.brandPost.flowId, ideaId: context.brandPost.ideaId, designId: context.brandPost.design.id, studyVersion: context.brandPost.design.studyVersion } : input)).digest('hex')
  const now = new Date()
  await collection(db).updateOne({ _id: id }, { $setOnInsert: { id, input, inputHash, savedStudy, ...(context ? { brandPost: context.brandPost } : {}), status: 'queued', stage: 'QUEUED', stages: {}, outputs: {}, attempts: 0, createdAt: now, updatedAt: now, nextRunAt: now } }, { upsert: true })
  const job = await collection(db).findOne({ _id: id })
  if (job.inputHash !== inputHash) throw new DesignLibraryError('This request ID belongs to another carousel.', 409)
  kickCarouselRun(db, id)
  return readCarouselRun(db, id)
}

export async function readCarouselRun(db: any, id: string) {
  const job = await collection(db).findOne({ _id: id })
  if (!job) throw new DesignLibraryError('Carousel generation not found.', 404)
  const stages = Object.entries(job.stages || {}).map(([stage, info]: any) => ({ stage, status: info.status, startedAt: info.startedAt, durationMs: info.durationMs }))
  return { id, status: job.status, stage: job.stage, progress: job.progress, stages, error: job.error || null, createdAt: job.createdAt,
    result: job.status === 'completed' ? job.result : undefined,
    slides: Object.entries(job.outputs || {}).filter(([key]) => /^SLIDE_\d+$/.test(key)).map(([, value]) => value).sort((a: any, b: any) => a.slideNumber - b.slideNumber),
    ...(carouselDebugEnabled() ? { debug: sanitizeCarouselLog({ stages: job.stages, outputs: job.outputs, failure: job.failure }) } : {}),
  }
}

export async function retryCarouselRun(db: any, id: string) {
  const result = await collection(db).updateOne({ _id: id, status: 'failed' }, { $set: { status: 'queued', attempts: 0, error: null, failure: null, nextRunAt: new Date() } })
  if (!result.matchedCount) return readCarouselRun(db, id)
  kickCarouselRun(db, id)
  return readCarouselRun(db, id)
}

export function kickCarouselRun(db: any, id: string) {
  if (runners.has(id)) return
  const task = runCarousel(db, id).catch(error => logCarouselStage(id, 'RUNNER', 'failed', carouselFailure(error))).finally(() => runners.delete(id))
  runners.set(id, task)
}

/** Database lease + stage checkpoints; polling also wakes work after a process restart. */
export async function runCarousel(db: any, id: string, dependencies = services) {
  const token = randomUUID(), now = new Date(), jobs = collection(db)
  const job = await jobs.findOneAndUpdate({ _id: id, $or: [
    { status: { $in: ['queued', 'retrying'] }, nextRunAt: { $lte: now } },
    { status: 'running', leaseUntil: { $lt: now } },
  ] }, { $set: { status: 'running', workerToken: token, leaseUntil: new Date(Date.now() + 90000), updatedAt: now }, $inc: { attempts: 1 } }, { returnDocument: 'after', includeResultMetadata: false })
  if (!job) return
  const owned = { _id: id, status: 'running', workerToken: token }
  let lostLease = false, currentStage = 'VALIDATING_INPUT', started = Date.now()
  const update = async (values: any) => {
    if (lostLease) throw Error('Carousel worker lease changed.')
    const result = await jobs.updateOne(owned, { $set: { ...values, updatedAt: new Date(), leaseUntil: new Date(Date.now() + 90000) } })
    if (!result.matchedCount) { lostLease = true; throw Error('Carousel worker lease changed.') }
  }
  const heartbeat = setInterval(() => { void update({}).catch(() => { lostLease = true }) }, 20000)
  const outputs = job.outputs || {}
  async function stage<T>(name: string, fn: () => Promise<T> | T, metadata: Record<string, unknown> = {}): Promise<T> {
    currentStage = name; started = Date.now()
    if (Object.prototype.hasOwnProperty.call(outputs, name)) {
      logCarouselStage(id, name, 'reused', metadata)
      return outputs[name]
    }
    await update({ stage: name, error: null, [`stages.${name}`]: { status: 'running', startedAt: new Date() }, progress: metadata })
    logCarouselStage(id, name, 'started', metadata)
    const output = await fn()
    const durationMs = Date.now() - started
    await update({ [`outputs.${name}`]: output, [`stages.${name}`]: { status: 'completed', startedAt: new Date(started), durationMs } })
    outputs[name] = output
    logCarouselStage(id, name, 'completed', { ...metadata, durationMs }, output)
    return output
  }
  try {
    const input = carouselInputSchema.parse(job.input)
    const study = await stage('ANALYZING_REFERENCES', async () => job.savedStudy || dependencies.analyzeDesignStudy(db, { referenceImages: input.references }, { onOutput: async (stage: string, output: any) => { logCarouselStage(id, stage, 'completed', {}, output) }, onProgress: async (progress: any) => { await update({ progress }); logCarouselStage(id, 'ANALYZING_REFERENCES', 'progress', progress) } }), { references: job.savedStudy?.referenceImages.length || input.references.length, reusedStudy: Boolean(job.savedStudy) })
    designStudySchema.parse(study)
    // Persist study automatically before downstream stages, using the existing study collection.
    const studyId = input.studyId || id
    await db.collection('globalDesignStudies').updateOne({ _id: studyId }, { $setOnInsert: { id: studyId, study, savedAt: new Date() } }, { upsert: true })
    const identity = await stage('BUILDING_DESIGN_DNA', () => dependencies.interpretDesignStudy(db, study))
    const content = await stage('ANALYZING_CONTENT', () => dependencies.analyzeCarouselContent(db, input.carouselContent))
    const direction = await stage('CREATING_CREATIVE_DIRECTION', () => dependencies.directCarousel(db, study, identity, content, input.optionalInstructions))
    await db.collection('globalCreativeDirections').updateOne({ _id: id }, { $setOnInsert: { id, stage: 'creative-direction', studyId, ...direction, createdAt: new Date() } }, { upsert: true })
    const system = await stage('CAROUSEL_VISUAL_SYSTEM', () => dependencies.createCarouselVisualSystem(db, identity, direction, content))
    const specs: any[] = []
    for (const slide of content.slides) specs.push(await stage(`PLANNING_SLIDE_${slide.slideNumber}`, () => dependencies.createSlideSpec(db, slide, system, direction, specs, input.optionalInstructions), { slide: slide.slideNumber, total: content.slides.length }))
    await stage('PLANNING_CAROUSEL', () => specs, { slides: specs.length })
    const prompts = await stage('BUILDING_PROMPTS', () => specs.map(spec => ({ slideNumber: spec.slideNumber, prompt: dependencies.buildGenerationPrompt(system, spec) })))
    const images: any[] = []
    for (const prompt of prompts) images.push(await stage(`SLIDE_${prompt.slideNumber}`, async () => generatedSlideSchema.parse(await dependencies.generateCarouselSlide(db, prompt.prompt, prompt.slideNumber)), { slide: prompt.slideNumber, total: prompts.length }))
    const result = await stage('SAVING_RESULT', async () => {
      const result = { id, studyId, canvas: CAROUSEL_CANVAS, slides: images, createdAt: new Date() }
      await db.collection('globalCarousels').updateOne({ _id: id }, { $setOnInsert: { ...result, content, interpretation: identity, creativeDirection: direction.creativeDirection, visualSystem: system, slideSpecs: specs, prompts } }, { upsert: true })
      return job.brandPost ? { ...result, canvas: await persistBrandCarousel(db, job.brandPost, result) } : result
    })
    await jobs.updateOne(owned, { $set: { status: 'completed', stage: 'COMPLETED', result, error: null, updatedAt: new Date() }, $unset: { workerToken: '', leaseUntil: '' } })
    logCarouselStage(id, 'COMPLETED', 'completed', { slides: images.length, durationMs: Date.now() - now.getTime() })
  } catch (error: any) {
    if (lostLease) return
    const failure = carouselFailure(error), retry = failure.retryable && job.attempts < 3
    const delay = Math.min(30000, 2000 * 2 ** job.attempts)
    const label = /^SLIDE_\d+$/.test(currentStage) ? `generating slide ${currentStage.slice(6)}` : currentStage.toLowerCase().replaceAll('_', ' ')
    const message = `Carousel generation failed while ${label}. ${[401, 403].includes(failure.providerStatusCode) ? 'Check the AI provider key and model access.' : 'Completed stages and slides are saved.'}`
    await jobs.updateOne(owned, { $set: { status: retry ? 'retrying' : 'failed', stage: currentStage, error: retry ? `The service is busy during ${label}. Retrying automatically…` : message, failure, [`stages.${currentStage}`]: { status: 'failed', durationMs: Date.now() - started, failure }, updatedAt: new Date(), nextRunAt: new Date(Date.now() + delay) }, $unset: { workerToken: '', leaseUntil: '' } })
    logCarouselStage(id, currentStage, 'failed', { ...failure, durationMs: Date.now() - started })
    if (retry) setTimeout(() => kickCarouselRun(db, id), delay).unref?.()
  } finally { clearInterval(heartbeat) }
}
