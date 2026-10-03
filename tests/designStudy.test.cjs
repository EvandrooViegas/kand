const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const crypto = require('node:crypto')
const { z } = require('zod')
const { stripTypeScriptTypes } = require('node:module')
const fixture = require('./designStudy.fixture.cjs')
function load(file, exports, deps = {}) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
  return new Function(...Object.keys(deps), stripTypeScriptTypes(source, { mode: 'transform' }) + `;return {${exports.join(',')}}`)(...Object.values(deps))
}
const { referenceSchema } = load('lib/designs/global/types.ts', ['referenceSchema'], { z })
const schemas = load('lib/designs/global/study.ts', ['designStudySchema', 'referenceStudySchema', 'familyStudySchema', 'studyReportSections'], { z, referenceSchema })

test('study schema requires complete DNA, individual observations and evidence for shared claims', () => {
  const valid = fixture.study()
  assert.deepEqual(schemas.designStudySchema.parse(valid), valid)
  for (const mutate of [s => delete s.designDNA.density, s => { s.referenceStudies.pop() }, s => { s.sharedCharacteristics[0].referenceIds = ['ref-1'] }, s => { s.variants = [] }, s => { s.designDNA.rules = ['Use good typography'] }]) {
    const invalid = structuredClone(valid); mutate(invalid)
    assert.equal(schemas.designStudySchema.safeParse(invalid).success, false)
  }
  const report = schemas.studyReportSections(valid.designDNA)
  assert.ok(report.some(s => s.title === 'Density & Whitespace' && s.items.includes(valid.designDNA.density.whitespaceStrategy)))
  assert.deepEqual(report.find(s => s.title === 'Anti-Rules').items, valid.designDNA.antiRules)
})

test('analysis observes every image before comparison, caches stages and never calls template creation', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const calls = [], cache = new Map(), progress = []
    const db = { collection: name => { assert.equal(name, 'globalDesignAnalysisCache'); return { findOne: async q => cache.get(q._id), updateOne: async (q, u) => cache.set(q._id, u.$set) } } }
    let fail = true, malformed = true
    const analyzer = load('lib/designs/global/studyAnalysis.ts', ['analyzeDesignStudy'], {
      ...schemas, referenceSchema, ...crypto, Groq: class {}, referenceData: async (_db, ref) => ref.url,
      withDesignProviderFallback: primary => primary(),
      resilientCompletion: async (_client, req) => {
        calls.push(req)
        const id = req.messages[0].content.match(/referenceId must be "([^"]+)"/)[1]
        if (fail && id === 'ref-2') throw Object.assign(Error('capacity'), { status: 503 })
        if (malformed) { malformed = false; return { choices: [{ message: { content: '{}' } }] } }
        return { choices: [{ message: { content: JSON.stringify(fixture.reference(id)) } }] }
      },
      availableGroqCompletion: async (_client, req) => {
        calls.push(req)
        const context = JSON.parse(req.messages[1].content[0].text)
        assert.equal(cache.size, 2, 'All individual studies precede synthesis')
        return { choices: [{ message: { content: JSON.stringify(fixture.family(context.referenceIds)) } }] }
      },
    })
    await assert.rejects(analyzer.analyzeDesignStudy(db, { referenceImages: fixture.refs }), /capacity/)
    assert.equal(cache.size, 1)
    fail = false
    const result = await analyzer.analyzeDesignStudy(db, { referenceImages: fixture.refs }, { onProgress: p => progress.push(p) })
    assert.equal(result.referenceStudies.length, 2)
    assert.equal(result.variants, undefined)
    assert.equal(result.designDNA.imagery.role, fixture.dna.imagery.role)
    assert.equal(cache.size, 3)
    const count = calls.length
    await analyzer.analyzeDesignStudy(db, { referenceImages: fixture.refs })
    assert.equal(calls.length, count)
    assert.ok(progress.every(p => p.total === 3))
    assert.ok(calls.every(req => req.max_tokens <= 3600))
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})

test('explicit save persists structured DNA and original references idempotently, without a design or Canvas', async () => {
  let saved, ready = false
  const collections = []
  const db = { collection: name => { collections.push(name); return name === 'globalDesignAnalysisJobs' ? { findOne: async () => ({ workflow: 'study', status: ready ? 'completed' : 'running', result: fixture.study() }) } : {
    updateOne: async (_q, u) => { saved ||= { _id: 'job', ...u.$setOnInsert } }, findOne: async () => saved,
  } } }
  const store = load('lib/designs/global/store.ts', ['saveDesignStudy'], schemas)
  await assert.rejects(store.saveDesignStudy(db, 'job'), /Complete the visual analysis/)
  ready = true
  const result = await store.saveDesignStudy(db, 'job')
  assert.deepEqual(result.study, fixture.study())
  await store.saveDesignStudy(db, 'job')
  assert.ok(collections.every(name => ['globalDesignAnalysisJobs', 'globalDesignStudies'].includes(name)))
})
