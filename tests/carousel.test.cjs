const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto')
const { stripTypeScriptTypes } = require('node:module'), { z } = require('zod')
const fixture = require('./designStudy.fixture.cjs'), creative = require('./creativeDirection.fixture.cjs')
function load(file, names, deps = {}) {
  return new Function(...Object.keys(deps), stripTypeScriptTypes(fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''), { mode: 'transform' }) + `;return {${names.join(',')}}`)(...Object.values(deps))
}
const { referenceSchema } = load('lib/designs/global/types.ts', ['referenceSchema'], { z })
const studyContracts = load('lib/designs/global/study.ts', ['designStudySchema'], { z, referenceSchema })
const logging = load('lib/designs/global/carouselLogging.ts', ['carouselDebugEnabled', 'sanitizeCarouselLog', 'carouselFailure'])
const names = ['CAROUSEL_CANVAS', 'carouselInputSchema', 'contentAnalysisSchema', 'generatedSlideSchema', 'explicitSlides', 'analyzeCarouselContent', 'visualSystemSchema', 'validateVisualSystem', 'validateSlideSpec', 'buildGenerationPrompt']
const contracts = load('lib/designs/global/carousel.ts', names, { z, referenceSchema })
const system = () => ({ canvas: contracts.CAROUSEL_CANVAS, brandFoundation: [{ characteristicId: 'palette', application: 'Preserve palette roles' }], palette: { background: 'forest green', primaryText: 'cream', secondaryText: 'cream', accent: 'lime', contrastRules: ['Light text on dark background; no lime on cream'], contextualImagePolicy: 'Keep natural photographic colors' }, typographySystem: { headline: 'Bold sans serif', supporting: 'Regular sans serif', emphasis: 'Scale contrast' }, spacingSystem: { edgeTreatment: 'Peripheral metadata space', groupSpacing: 'Structured groups', density: 'medium' }, branding: { placement: 'Upper corner', treatment: 'Empty until supplied' }, sharedMotifs: [{ characteristicId: 'circle', useWhen: 'Emphasize a focal point' }], imageTreatment: { policy: 'Optional', treatment: 'Natural colors' }, consistencyRules: ['Same palette roles', 'Same type language'], variationRules: ['Vary alignment', 'Vary headline scale'] })
const decisions = image => ({ role: 'hook', headlineLines: 1, ctaLastLine: false, composition: { layout: 'Asymmetric hero', alignment: 'left', focalPoint: 'headline', negativeSpace: 'medium', density: 'medium', textPlacement: 'upper left', visualPlacement: image ? 'lower right' : null }, typography: { headlineTreatment: 'Oversized sans serif', supportingTreatment: 'Small regular text', emphasis: 'Scale' }, imagery: { enabled: image, subject: image ? 'Neutral desk' : null, treatment: image ? 'Natural contextual colors' : null }, motifs: [], generationInstructions: ['Keep copy readable'] })

test('input fixes carousel format and supports one reference or saved DNA, never both', () => {
  const input = contracts.carouselInputSchema.parse({ references: fixture.study().referenceImages.slice(0, 1), carouselContent: 'Slide 1\nHello\nSlide 2\nWorld' })
  assert.equal(input.references.length, 1)
  assert.equal(contracts.carouselInputSchema.safeParse({ ...input, studyId: 'saved' }).success, false)
  assert.equal(contracts.carouselInputSchema.safeParse({ studyId: 'saved', carouselContent: 'Copy', format: 'story' }).success, false)
  assert.deepEqual(contracts.CAROUSEL_CANVAS, { platform: 'instagram', contentType: 'carousel', width: 1080, height: 1350, aspectRatio: '4:5' })
  const study = structuredClone(fixture.study()); study.referenceImages.pop(); study.referenceStudies.pop(); study.sharedCharacteristics = []
  assert.doesNotThrow(() => studyContracts.designStudySchema.parse(study))
})

test('explicit boundaries and wording are preserved; empty and reordered slides fail', async () => {
  const source = 'Slide 1:\nReceber pagamentos não devia ser complicado.\n\nSlide 2\nMenos complicação.\nMais controlo.'
  const result = await contracts.analyzeCarouselContent({}, source)
  assert.deepEqual(result.slides.map(s => s.text), ['Receber pagamentos não devia ser complicado.', 'Menos complicação.\nMais controlo.'])
  assert.equal(result.explicitBoundaries, true)
  assert.throws(() => contracts.explicitSlides('Slide 2\nWrong start'), /consecutive/)
  assert.throws(() => contracts.explicitSlides('Slide 1:\nSlide 2:\nOnly second'), /no copy/)
  await assert.rejects(() => contracts.analyzeCarouselContent({}, 'Slide 1\nOnly one'), /at least 2/)
})

test('AI segmentation selects original content units with complete ordered coverage', async () => {
  const source = 'First thought. Second thought!\nThird thought?'
  let payload
  const api = load('lib/designs/global/carousel.ts', names, { z, referenceSchema, creativeJSON: async (_db, _prompt, input, validate) => {
    payload = input
    assert.throws(() => validate({ groups: [[0], [0, 1]] }), /exactly once/)
    return validate({ groups: [[0], input.units.slice(1).map(u => u.id)] })
  } })
  const result = await api.analyzeCarouselContent({}, source)
  assert.equal(payload.units.map(u => u.text).join(''), source)
  assert.equal(result.slides.map(s => s.text).join(' ').replace(/\s+/g, ' '), source.replace(/\s+/g, ' '))
})

test('core identity is required; uncertain and unsupported motifs cannot become generation requirements', () => {
  assert.doesNotThrow(() => contracts.validateVisualSystem(system(), creative.identity()))
  const missing = system(); missing.brandFoundation = []
  assert.throws(() => contracts.validateVisualSystem(missing, creative.identity()), /CORE/)
  const uncertain = system(); uncertain.brandFoundation.push({ characteristicId: 'font-name', application: 'Force exact font' })
  assert.throws(() => contracts.validateVisualSystem(uncertain, creative.identity()), /uncertain/)
  const invented = system(); invented.sharedMotifs.push({ characteristicId: 'new-motif', useWhen: 'Everywhere' })
  assert.throws(() => contracts.validateVisualSystem(invented, creative.identity()), /supported/)
})

test('slide copy is bound server-side; imagery is optional and motifs are selected per slide', () => {
  const slide = { slideNumber: 1, text: 'Headline\nSupporting statement\nDiscover more' }
  for (const enabled of [false, true]) {
    const raw = { ...decisions(enabled), ctaLastLine: true }
    const result = contracts.validateSlideSpec(raw, slide, system())
    assert.deepEqual(result.copy, { headline: 'Headline', supportingText: 'Supporting statement', cta: 'Discover more' })
    assert.equal(result.imagery.enabled, enabled)
    assert.deepEqual(result.motifs, [])
    assert.match(contracts.buildGenerationPrompt(system(), result), /Render ONLY/)
    assert.match(contracts.buildGenerationPrompt(system(), result), /Headline/)
  }
  assert.throws(() => contracts.validateSlideSpec({ ...decisions(false), headlineLines: 3, ctaLastLine: true }, slide, system()), /non-overlapping/)
  assert.throws(() => contracts.validateSlideSpec({ ...decisions(false), copy: { headline: 'Guaranteed 90% increase' } }, slide, system()))
  assert.throws(() => contracts.validateSlideSpec({ ...decisions(false), imagery: { enabled: false, subject: 'Photo', treatment: null } }, slide, system()), /Imagery/)
})

test('consecutive slide plans must vary while retaining the same visual system', () => {
  const slide = { slideNumber: 1, text: 'First headline' }
  const first = contracts.validateSlideSpec(decisions(false), slide, system())
  assert.throws(() => contracts.validateSlideSpec(decisions(false), { slideNumber: 2, text: 'Second headline' }, system(), [first]), /Vary composition/)
  const next = decisions(false); next.typography.headlineTreatment = 'Large typographic statement with tight line spacing'
  assert.doesNotThrow(() => contracts.validateSlideSpec(next, { slideNumber: 2, text: 'Second headline' }, system(), [first]))
})

test('harmless live model response variations normalize without changing design instructions', () => {
  const slide = { slideNumber: 1, text: 'Supplied headline' }
  const raw = decisions(false); raw.generationInstructions = 'Keep copy readable'
  assert.deepEqual(contracts.validateSlideSpec(raw, slide, system()).generationInstructions, ['Keep copy readable'])
  const emptyBranding = system(); emptyBranding.branding.treatment = ''
  assert.match(contracts.validateVisualSystem(emptyBranding, creative.identity()).branding.treatment, /unbranded/)
  const malformed = decisions(false); malformed.generationInstructions = 12
  assert.throws(() => contracts.validateSlideSpec(malformed, slide, system()))
})

test('image adapter reuses the provider, crops only reserved bleed, and persists a 1080x1350 PNG', async () => {
  const sharp = require('sharp')
  const artwork = await sharp({ create: { width: 1024, height: 1280, channels: 3, background: '#008800' } }).png().toBuffer()
  const providerPng = await sharp({ create: { width: 1024, height: 1536, channels: 3, background: '#0000ff' } }).composite([{ input: artwork, top: 128, left: 0 }]).png().toBuffer()
  let saved
  const adapter = load('lib/designs/global/carouselImages.ts', ['generateCarouselSlide'], { sharp,
    generateImageOpenAI: async (prompt, transparent, options) => { assert.equal(prompt, 'Validated prompt'); assert.equal(transparent, false); assert.equal(options.size, '1024x1536'); return { url: 'data:image/png;base64,' + providerPng.toString('base64') } },
    persistInlineImages: async (_db, value) => { saved = Buffer.from(value.url.split(',')[1], 'base64'); return { url: '/api/uploads/test-image' } },
  })
  const result = await adapter.generateCarouselSlide({}, 'Validated prompt', 2)
  assert.equal(result.url, '/api/uploads/test-image'); assert.equal(result.slideNumber, 2)
  const metadata = await sharp(saved).metadata(); assert.equal(metadata.width, 1080); assert.equal(metadata.height, 1350)
  const pixel = await sharp(saved).extract({ left: 540, top: 675, width: 1, height: 1 }).removeAlpha().raw().toBuffer()
  assert.deepEqual([...pixel], [0, 136, 0])
  assert.doesNotThrow(() => contracts.generatedSlideSchema.parse(result))
})

test('logs redact nested credentials, signed URLs, inline bytes and secrets embedded in errors', () => {
  process.env.CAROUSEL_TEST_SECRET = 'private-environment-secret'
  try {
    const value = logging.sanitizeCarouselLog({ authorization: 'Bearer private', nested: { api_key: 'raw-key', content: 'private-environment-secret' }, error: 'Bearer private-token https://user:pass@example.com/a?X-Amz-Signature=secret mongodb://user:pass@host/db', image: 'data:image/png;base64,aGVsbG8=', message: 'API_KEY="quoted-private-key" token=private-token-value', token: 'nested-token-value' })
    const serialized = JSON.stringify(value)
    for (const secret of ['raw-key', 'private-environment-secret', 'private-token', 'user:pass', 'X-Amz-Signature', 'aGVsbG8', 'quoted-private-key', 'private-token-value', 'nested-token-value']) assert.ok(!serialized.includes(secret), secret)
    assert.match(serialized, /REDACTED/)
  } finally { delete process.env.CAROUSEL_TEST_SECRET }
})

function setup(overrides = {}, saved = false) {
  const rows = new Map(), calls = [], logs = [], timers = []
  const input = { ...(saved ? { studyId: 'saved-study', references: [] } : { references: fixture.study().referenceImages }), carouselContent: 'Slide 1\nHello\nSlide 2\nWorld', optionalInstructions: '' }
  const row = { _id: 'carousel_test', id: 'carousel_test', input, savedStudy: saved ? fixture.study() : undefined, status: 'queued', stage: 'QUEUED', stages: {}, outputs: {}, attempts: 0, nextRunAt: new Date(0) }
  rows.set('globalCarouselRuns:carousel_test', row)
  const matches = (r, q) => Object.entries(q).every(([k, v]) => k === '$or' ? v.some(sub => matches(r, sub)) : v && typeof v === 'object' && !(v instanceof Date) ? Object.entries(v).every(([op, val]) => op === '$in' ? val.includes(r[k]) : op === '$lte' ? r[k] <= val : op === '$lt' ? r[k] < val : false) : r[k] === v)
  const set = (r, key, value) => { const path = key.split('.'); let target = r; for (const part of path.slice(0, -1)) target = target[part] ||= {}; target[path.at(-1)] = structuredClone(value) }
  const update = (r, u, insert = false) => { for (const [k, v] of Object.entries({ ...(insert ? u.$setOnInsert : {}), ...u.$set })) set(r, k, v); for (const [k, v] of Object.entries(u.$inc || {})) r[k] = (r[k] || 0) + v; for (const k of Object.keys(u.$unset || {})) delete r[k] }
  const db = { collection: name => ({
    findOne: async q => { const r = rows.get(name + ':' + q._id); return r && matches(r, q) ? structuredClone(r) : null },
    updateOne: async (q, u, options) => { const key = name + ':' + q._id; let r = rows.get(key); if (!r && options?.upsert) { r = { _id: q._id }; update(r, u, true); rows.set(key, r); return { matchedCount: 1 } } if (!r || !matches(r, q)) return { matchedCount: 0 }; update(r, u); return { matchedCount: 1 } },
    findOneAndUpdate: async (q, u) => { const r = rows.get(name + ':' + q._id); if (!r || !matches(r, q)) return null; update(r, u); return structuredClone(r) },
  }) }
  const content = { explicitBoundaries: true, slides: [{ slideNumber: 1, text: 'Hello' }, { slideNumber: 2, text: 'World' }] }
  const dependencies = {
    analyzeDesignStudy: async () => { calls.push('analysis'); return fixture.study() },
    interpretDesignStudy: async (_db, study) => { assert.equal(study.schemaVersion, 1); calls.push('identity'); return creative.identity() },
    analyzeCarouselContent: async (_db, copy) => { assert.equal(copy, input.carouselContent); calls.push('content'); return content },
    directCarousel: async (_db, study, identity, supplied) => { assert.deepEqual(supplied, content); calls.push('direction'); return { creativeDirection: { concept: 'Coherent series' } } },
    createCarouselVisualSystem: async () => { calls.push('system'); return system() },
    createSlideSpec: async (_db, slide, shared) => { assert.deepEqual(shared, system()); calls.push('spec-' + slide.slideNumber); return contracts.validateSlideSpec(decisions(false), slide, shared) },
    buildGenerationPrompt: (shared, slide) => { calls.push('prompt-' + slide.slideNumber); return contracts.buildGenerationPrompt(shared, slide) },
    generateCarouselSlide: async (_db, prompt, number) => { calls.push('image-' + number); assert.match(prompt, /EXACT COPY/); return { slideNumber: number, url: '/api/uploads/image-' + number, width: 1080, height: 1350 } },
    ...overrides,
  }
  const api = load('lib/designs/global/carouselJobs.ts', ['runCarousel', 'readCarouselRun'], { ...crypto, ...contracts, ...studyContracts, ...dependencies, ...logging, globalThis: {}, logCarouselStage: (...args) => logs.push(args), setTimeout: fn => { timers.push(fn); return { unref() {} } } })
  return { api, db, row, rows, calls, logs, timers, dependencies }
}

test('one run automatically completes all stages, persists output and reuses saved study without vision', async () => {
  for (const saved of [false, true]) {
    const f = setup({}, saved)
    await f.api.runCarousel(f.db, f.row.id, f.dependencies)
    assert.equal(f.row.status, 'completed')
    assert.equal(f.calls.includes('analysis'), !saved)
    assert.ok(f.rows.has('globalCarousels:carousel_test'))
    assert.ok(f.rows.has('globalCreativeDirections:carousel_test'))
    assert.equal(f.row.result.slides.length, 2)
    assert.equal(f.row.result.canvas.aspectRatio, '4:5')
    assert.equal(f.row.outputs.BUILDING_PROMPTS.length, 2)
    assert.ok(f.logs.some(log => log[1] === 'CREATING_CREATIVE_DIRECTION' && log[2] === 'completed'))
    const count = f.calls.length
    await f.api.runCarousel(f.db, f.row.id, f.dependencies)
    assert.equal(f.calls.length, count)
  }
})

test('transient slide failure resumes automatically from checkpoints without regenerating completed slides', async () => {
  let fail = true, imageCalls = []
  const f = setup({ generateCarouselSlide: async (_db, _prompt, number) => { imageCalls.push(number); if (number === 2 && fail) throw { status: 503, message: 'capacity' }; return { slideNumber: number, url: '/api/uploads/image-' + number, width: 1080, height: 1350 } } })
  await f.api.runCarousel(f.db, f.row.id, f.dependencies)
  assert.equal(f.row.status, 'retrying'); assert.equal(f.timers.length, 1)
  assert.deepEqual(imageCalls, [1, 2])
  f.row.nextRunAt = new Date(0); fail = false
  await f.api.runCarousel(f.db, f.row.id, f.dependencies)
  assert.equal(f.row.status, 'completed'); assert.deepEqual(imageCalls, [1, 2, 2])
  assert.equal(f.calls.filter(c => c === 'analysis').length, 1)
  assert.ok(f.logs.some(log => log[1] === 'SLIDE_1' && log[2] === 'reused'))
})

test('blocking errors name the slide; production responses omit all debug data', async () => {
  const f = setup({ generateCarouselSlide: async () => { throw { status: 403, message: 'access denied' } } })
  await f.api.runCarousel(f.db, f.row.id, f.dependencies)
  assert.equal(f.row.status, 'failed'); assert.match(f.row.error, /generating slide 1/)
  const oldEnv = process.env.NODE_ENV, oldFlag = process.env.CAROUSEL_INTERNAL_DEBUG
  try {
    process.env.NODE_ENV = 'production'; process.env.CAROUSEL_INTERNAL_DEBUG = 'false'
    const response = await f.api.readCarouselRun(f.db, f.row.id)
    assert.equal(response.debug, undefined); assert.equal(response.outputs, undefined)
    process.env.CAROUSEL_INTERNAL_DEBUG = 'true'
    assert.ok((await f.api.readCarouselRun(f.db, f.row.id)).debug)
  } finally { if (oldEnv === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = oldEnv; if (oldFlag === undefined) delete process.env.CAROUSEL_INTERNAL_DEBUG; else process.env.CAROUSEL_INTERNAL_DEBUG = oldFlag }
})

test('live worker lease prevents duplicate calls and expired lease resumes saved stages', async () => {
  const f = setup()
  f.row.status = 'running'; f.row.leaseUntil = new Date(Date.now() + 90000)
  await f.api.runCarousel(f.db, f.row.id, f.dependencies)
  assert.equal(f.calls.length, 0)
  f.row.leaseUntil = new Date(0)
  await f.api.runCarousel(f.db, f.row.id, f.dependencies)
  assert.equal(f.row.status, 'completed')
})

