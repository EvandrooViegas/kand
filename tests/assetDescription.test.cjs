const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const load = path => stripTypeScriptTypes(fs.readFileSync(path, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''))
const { scoreAsset, findCandidates } = new Function(load('lib/handlers/assetPlannerHandler.ts') + ';return {scoreAsset,findCandidates}')()

test('multilingual descriptions are preserved and indexed once with no automatic retries', async () => {
  const requests = []
  class Groq {
    constructor(options) {
      assert.equal(options.maxRetries, 0)
      this.chat = { completions: { create: async body => {
        requests.push(body)
        assert.equal(body.model, 'qwen/qwen3.8-27b')
        return { choices: [{ message: { content: JSON.stringify({ description_en: 'Wheat field at harvest', tags_en: ['wheat', 'field', 'harvest'] }) } }] }
      } } }
    }
  }
  const { indexAssetDescription } = new Function('Groq', 'process', load('lib/services/assetDescription.ts') + ';return {indexAssetDescription}')(Groq, { env: { GROQ_API_KEY: 'test' } })
  for (const description of ['Campo de trigo na colheita', 'حقل قمح عند الحصاد', '収穫時の小麦畑']) {
    const result = await indexAssetDescription(description)
    assert.equal(result.description, description)
    assert.equal(JSON.parse(requests.at(-1).messages[1].content).description, description)
    assert.equal(scoreAsset(result, ['wheat', 'field', 'harvest']), 1)
    assert.equal(scoreAsset(result, ['office', 'computer']), 0)
  }
  assert.equal(requests.length, 3)
  assert.deepEqual(await indexAssetDescription('  '), { description: '', search_description: '', description_tags: [] })
  await assert.rejects(indexAssetDescription('x'.repeat(2001)))
  assert.equal(requests.length, 3)
})

test('description indexing errors do not trigger another model call', async () => {
  let calls = 0
  class Groq { constructor() { this.chat = { completions: { create: async () => { calls++; return { choices: [{ message: { content: '{}' } }] } } } } } }
  const index = new Function('Groq', 'process', load('lib/services/assetDescription.ts') + ';return indexAssetDescription')(Groq, { env: { GROQ_API_KEY: 'test' } })
  await assert.rejects(index('Uma imagem'), /could not be indexed/)
  assert.equal(calls, 1)
})

test('an explicit description model is honored and access errors never trigger model switching', async () => {
  const requests = []
  const denied = Object.assign(new Error('Model unavailable'), { status: 404, code: 'model_not_found' })
  class Groq { constructor(options) {
    assert.equal(options.maxRetries, 0)
    this.chat = { completions: { create: async body => { requests.push(body); throw denied } } }
  } }
  const index = new Function('Groq', 'process', load('lib/services/assetDescription.ts') + ';return indexAssetDescription')(Groq, { env: { GROQ_API_KEY: 'test', GROQ_DESCRIPTION_MODEL: ' custom-model ' } })
  await assert.rejects(index('Campo de trigo'), error => error === denied)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].model, 'custom-model')
})

test('matching prioritizes the description and includes indexed uploads before visual tagging completes', () => {
  const relevant = { id: 'field', status: 'processing', description: 'Campo de trigo', description_tags: ['wheat field', 'harvest'], tags: ['computer'] }
  const irrelevant = { id: 'office', status: 'ready', description: 'Escritório', description_tags: ['office'], tags: ['wheat', 'field', 'harvest'] }
  assert.equal(scoreAsset(irrelevant, ['wheat', 'field', 'harvest']), 0)
  assert.deepEqual(findCandidates([irrelevant, relevant], ['wheat', 'field', 'harvest']).map(a => a.asset_id), ['field'])
  assert.equal(scoreAsset({ tags: ['cart', 'cart'] }, ['art']), 0)
  assert.equal(scoreAsset({ tags: ['field', 'field'] }, ['field', 'field']), 1)
})

test('description editing is brand scoped, avoids unchanged reindexing, and supports clearing', async () => {
  let calls = 0
  let asset = { _id: 'internal', id: 'a', brand_id: 'brand-a', tags: ['original'] }
  const db = { collection: () => ({
    findOne: async filter => filter.id === asset.id && filter.brand_id === asset.brand_id ? asset : null,
    updateOne: async (filter, update) => { assert.equal(filter.brand_id, 'brand-a'); asset = { ...asset, ...update.$set } }
  }) }
  const index = async description => { calls++; return { description, search_description: description ? 'wheat field' : '', description_tags: description ? ['wheat', 'field'] : [] } }
  const handle = new Function('NextResponse', 'corsify', 'indexAssetDescription', load('lib/handlers/assetHandlers.ts') + ';return handleUpdateAsset')({ json: (body, options) => ({ body, status: options?.status || 200 }) }, r => r, index)
  assert.equal((await handle(db, 'a', { brand_id: 'other', description: 'Campo' })).status, 404)
  assert.equal(calls, 0)
  const saved = await handle(db, 'a', { brand_id: 'brand-a', description: 'Campo' })
  assert.equal(saved.body.description, 'Campo')
  assert.deepEqual(saved.body.tags, ['original'])
  assert.equal(saved.body._id, undefined)
  await handle(db, 'a', { brand_id: 'brand-a', description: 'Campo' })
  assert.equal(calls, 1)
  const cleared = await handle(db, 'a', { brand_id: 'brand-a', description: '' })
  assert.deepEqual(cleared.body.description_tags, [])
  assert.equal(cleared.body.search_description, '')
  assert.equal((await handle(db, 'a', { brand_id: 'brand-a', description: 4 })).status, 400)
})

test('background-photo planning selects a described brand upload only above the relevance threshold', async () => {
  const brief = () => ({ slot_id: 'slide_1', needs_visual: true, preferred_source: 'unsplash', search_keywords: ['wheat', 'field', 'harvest'] })
  const handle = new Function('localAssetBrief', 'NextResponse', 'corsify', load('lib/handlers/assetPlannerHandler.ts') + ';return handlePlanAssets')(brief, { json: body => body }, r => r)
  let tags = ['wheat', 'field', 'harvest']
  const db = { collection: name => name === 'flows' ? { findOne: async () => null } : { find: filter => {
    assert.equal(filter.brand_id, 'brand-a')
    assert.ok(filter.$or.some(condition => condition['description_tags.0']))
    return { limit: () => ({ toArray: async () => [{ id: 'upload', url: 'photo', status: 'processing', description: 'Campo de trigo', description_tags: tags }] }) }
  } } }
  const request = { brand_id: 'brand-a', brandContext: {}, copy: { headline: 'Harvest' }, idea: { id: 'post' }, layoutPlan: { slots: [{ slot_id: 'slide_1', needs_visual: true, treatment: 'environmental', background: true }] } }
  const relevant = await handle(db, request)
  assert.equal(relevant.slots[0].preferred_source, 'uploaded_asset')
  assert.equal(relevant.slots[0].selected.asset_id, 'upload')
  tags = ['wheat']
  const insufficient = await handle(db, request)
  assert.equal(insufficient.slots[0].selected, null)
  assert.equal(insufficient.slots[0].candidates.length, 0)
})
