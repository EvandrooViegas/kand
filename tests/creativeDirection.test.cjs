const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto')
const { stripTypeScriptTypes } = require('node:module'), { z } = require('zod')
const studyFixture = require('./designStudy.fixture.cjs'), fixture = require('./creativeDirection.fixture.cjs')
function load(file, names, deps = {}) {
  return new Function(...Object.keys(deps), stripTypeScriptTypes(fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''), { mode: 'transform' }) + `;return {${names.join(',')}}`)(...Object.values(deps))
}
const { referenceSchema } = load('lib/designs/global/types.ts', ['referenceSchema'], { z })
const { designStudySchema } = load('lib/designs/global/study.ts', ['designStudySchema'], { z, referenceSchema })
const contracts = load('lib/designs/global/creativeDirection.ts', ['postBriefSchema', 'identityInterpretationSchema', 'creativeDirectionSchema', 'studyEvidence', 'validateInterpretation', 'validateCreativeDirection', 'directionCanvas'], { z, designStudySchema })
const brief = () => contracts.postBriefSchema.parse({ topic: 'Making payments easier', headline: 'Receber pagamentos não devia ser complicado.', supportingText: 'Simplifica a forma como recebes.', cta: 'Descobre mais' })
const make = (b = brief(), image = false) => fixture.direction(b, contracts.directionCanvas(b.format), image)

test('Post Brief accepts missing optional fields and maps all four formats deterministically', () => {
  const b = contracts.postBriefSchema.parse({ topic: 'A new idea' })
  for (const field of ['headline', 'supportingText', 'cta', 'imageDirection', 'additionalInstructions']) assert.equal(b[field], null)
  assert.equal(contracts.postBriefSchema.safeParse({}).success, false)
  for (const [format, ratio, height] of [['feed-post','1:1',1080],['portrait-post','4:5',1350],['story','9:16',1920],['carousel-cover','4:5',1350]]) {
    assert.deepEqual(contracts.directionCanvas(format), { platform: 'instagram', format, aspectRatio: ratio, recommendedSize: { width: 1080, height } })
  }
  assert.doesNotThrow(() => contracts.validateCreativeDirection(make(b), b, fixture.identity()))
  const pending = make(b)
  pending.content.hierarchy.push({ element: 'metadata', priority: 1, treatment: 'Corner labels from a reference' })
  assert.equal(contracts.validateCreativeDirection(pending, b, fixture.identity()).content.hierarchy.length, 0)
})

test('core needs every reference, motifs stay optional, and uncertain evidence cannot become fact', () => {
  assert.doesNotThrow(() => contracts.validateInterpretation(fixture.identity(), studyFixture.study()))
  const identifiersOnly = fixture.identity()
  identifiersOnly.characteristics.forEach(c => c.evidence.forEach(e => delete e.quote))
  assert.deepEqual(contracts.validateInterpretation(identifiersOnly, studyFixture.study()), fixture.identity())
  for (const [index, strength, mutate] of [
    [0, 'REFERENCE_SPECIFIC', i => { i.characteristics[0].evidence.pop() }],
    [2, 'OPTIONAL', i => { i.characteristics[2].strength = 'CORE' }],
    [3, 'REFERENCE_SPECIFIC', i => { i.characteristics[3].strength = 'STRONG' }],
    [4, 'UNCERTAIN', i => { i.characteristics[4].strength = 'CORE' }],
    [0, 'UNCERTAIN', i => { i.characteristics[0].characteristic = 'Always left-align every headline' }],
  ]) {
    const identity = fixture.identity(); mutate(identity)
    assert.equal(contracts.validateInterpretation(identity, studyFixture.study()).characteristics[index].strength, strength)
  }
  const fabricated = fixture.identity(); fabricated.characteristics[0].evidence[0].quote = 'Fabricated observation'
  assert.throws(() => contracts.validateInterpretation(fabricated, studyFixture.study()), /actual study text/)
  const imageIdentity = fixture.identity()
  imageIdentity.characteristics.push({ id: 'photo-balance', domain: 'composition', strength: 'CORE', characteristic: 'Balance photography with text.', rationale: 'Repeated imagery treatment.', evidence: [1, 2].map(i => ({ sourceId: `r${i}.imagery.description` })) })
  assert.equal(contracts.validateInterpretation(imageIdentity, studyFixture.study()).characteristics.at(-1).strength, 'STRONG')

})

test('Creative Direction preserves core, selects one motif, rejects another and permits both imagery modes', () => {
  const b = brief()
  for (const useImagery of [false, true]) {
    const result = contracts.validateCreativeDirection(make(b, useImagery), b, fixture.identity())
    assert.equal(result.imagery.useImagery, useImagery)
    assert.equal(result.motifs.selected.length, 1)
    assert.equal(result.motifs.rejected[0].characteristicId, 'arrow')
    assert.deepEqual(result.brandConsistency.coreCharacteristics, [fixture.identity().characteristics[0].characteristic])
    assert.equal(result.brandConsistency.optionalCharacteristicsUsed.includes('Hand-drawn arrows'), false)
    assert.match(result.colors.contextualImagePolicy, /natural photographic/)
  }
  const withoutCore = make(); withoutCore.appliedPrinciples = withoutCore.appliedPrinciples.filter(p => p.characteristicId !== 'palette')
  assert.throws(() => contracts.validateCreativeDirection(withoutCore, b, fixture.identity()), /core identity/)
  const uncertain = make(); uncertain.appliedPrinciples.push({ characteristicId: 'font-name', application: 'Use an exact font name.' })
  assert.throws(() => contracts.validateCreativeDirection(uncertain, b, fixture.identity()), /Uncertain/)
  const selected = make(); selected.appliedPrinciples = selected.appliedPrinciples.filter(p => p.characteristicId !== 'circle')
  assert.ok(contracts.validateCreativeDirection(selected, b, fixture.identity()).appliedPrinciples.some(p => p.characteristicId === 'circle'))
})

test('unsupported copy, offers, URLs and invented missing content fail before persistence', () => {
  const b = brief()
  for (const copy of ['Save 50%', 'Only €9.99', 'Guaranteed returns', 'Visit https://invented.example', 'A fabricated testimonial']) {
    const result = make(); result.content.supportingText = copy
    assert.throws(() => contracts.validateCreativeDirection(result, b, fixture.identity()), /verbatim|unsupported URL/)
  }
  const missing = contracts.postBriefSchema.parse({ topic: 'Education' }), result = make(missing)
  result.content.headline = 'Invented business claim'
  assert.throws(() => contracts.validateCreativeDirection(result, missing, fixture.identity()), /verbatim|unsupported URL/)
  const invalid = make(); invalid.imagery.subject = 'Unrequested photo'
  assert.throws(() => contracts.validateCreativeDirection(invalid, b, fixture.identity()), /Disabled imagery/)
  const hidden = make(); hidden.generationNotes.push('Include https://invented.example as the destination.')
  assert.throws(() => contracts.validateCreativeDirection(hidden, b, fixture.identity()), /unsupported URL/)
})

function service(fabricate = false) {
  const calls = [], cache = new Map(), saved = new Map(), collections = []
  const db = { collection(name) {
    collections.push(name)
    const data = name === 'globalDesignAnalysisCache' ? cache : saved
    return { findOne: async q => data.get(q._id), updateOne: async (q, u) => { if (u.$set) data.set(q._id, u.$set); else if (!data.has(q._id)) data.set(q._id, { _id: q._id, ...u.$setOnInsert }) }, find: q => ({ sort() { return this }, limit() { return this }, toArray: async () => [...data.values()].filter(v => v.studyId === q.studyId) }) }
  } }
  class DesignLibraryError extends Error { constructor(message, status = 400) { super(message); this.status = status } }
  const api = load('lib/designs/global/creativeDirector.ts', ['directCreativePost', 'createCreativeDirection', 'readCreativeDirections'], {
    ...contracts, ...crypto, Groq: class {}, DesignLibraryError, getDesignStudy: async () => ({ study: studyFixture.study() }),
    withDesignProviderFallback: primary => primary(),
    availableGroqCompletion: async (_client, request) => {
      const payload = JSON.parse(request.messages[1].content[0].text); calls.push({ request, payload })
      const result = payload.evidence ? fixture.identity() : fixture.direction(payload.postBrief, payload.canvas, Boolean(payload.postBrief.imageDirection))
      if (fabricate && !payload.evidence) result.content.headline = 'Guaranteed 50% savings'
      return { choices: [{ message: { content: JSON.stringify(result) } }] }
    },
  })
  return { api, db, calls, saved, collections, recover: () => { fabricate = false } }
}

test('study and brief reach their stages; direction is saved, reloadable and safe to retry', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const f = service(), input = { studyId: 'study', requestId: 'request', postBrief: brief() }
    const result = await f.api.createCreativeDirection(f.db, input)
    assert.equal(f.calls.length, 2)
    assert.equal(f.calls[0].payload.designStudy.name, studyFixture.study().name)
    assert.ok(f.calls[0].payload.evidence.some(e => e.id.startsWith('r2.')))
    assert.equal(f.calls[1].payload.postBrief.headline, input.postBrief.headline)
    assert.deepEqual(f.calls[1].payload.identity, fixture.identity())
    assert.equal(result.creativeDirection.content.headline, input.postBrief.headline)
    assert.equal(result.stage, 'creative-direction')
    assert.equal((await f.api.readCreativeDirections(f.db, 'study'))[0].id, result.id)
    await f.api.createCreativeDirection(f.db, input)
    assert.equal(f.calls.length, 2)
    assert.equal(f.saved.size, 1)
    await assert.rejects(f.api.createCreativeDirection(f.db, { ...input, postBrief: { topic: 'Changed' } }), /different brief/)
    await f.api.createCreativeDirection(f.db, { ...input, requestId: 'second', postBrief: { topic: 'Announcement', imageDirection: 'Use a contextual image' } })
    assert.equal(f.calls.length, 3, 'Identity interpretation reused for another post')
    assert.equal(f.saved.get('second').creativeDirection.imagery.useImagery, true)
    assert.ok(f.collections.every(name => ['globalDesignAnalysisCache', 'globalCreativeDirections'].includes(name)))
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})

test('absent secondary copy may reuse the chosen primary text color', () => {
  const b = contracts.postBriefSchema.parse({ headline: 'Supplied headline' })
  const raw = make(b); raw.colors.secondaryText = null
  const result = contracts.validateCreativeDirection(raw, b, fixture.identity())
  assert.equal(result.colors.secondaryText, raw.colors.primaryText)
  const hasBody = brief(); const invalid = make(hasBody); invalid.colors.secondaryText = null
  assert.throws(() => contracts.validateCreativeDirection(invalid, hasBody, fixture.identity()))
})

test('invalid business copy is never saved and a retry reuses the completed identity interpretation', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const f = service(true), input = { studyId: 'study', requestId: 'repair', postBrief: brief() }
    await assert.rejects(f.api.createCreativeDirection(f.db, input), /did not pass evidence or content validation/)
    assert.equal(f.saved.size, 0)
    assert.equal(f.calls.length, 3)
    f.recover()
    const result = await f.api.createCreativeDirection(f.db, input)
    assert.equal(f.calls.length, 4)
    assert.equal(result.creativeDirection.content.headline, input.postBrief.headline)
    assert.equal(f.saved.size, 1)
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})
