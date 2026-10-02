const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { z } = require('zod')
const { load, seeds, types } = require('./globalDesigns.test.cjs')
const variations = load('lib/designs/global/variations.ts', ['ensureFamilyVariations'], types)
function setup(failLater = false, malformedFirst = false) {
  const cache = new Map(), calls = []
  const db = { collection: () => ({ findOne: async q => cache.get(q._id), updateOne: async (q, u) => cache.set(q._id, u.$set) }) }
  let fail = failLater
  const analyzer = load('lib/designs/global/analyze.ts', ['analyzeDesignReferences'], {
    ...types, ...variations, z, ...crypto, join: require('node:path').join,
    Groq: class {}, readFile: async path => Buffer.from(path),
    sharp: bytes => ({ rotate() { return this }, resize() { return this }, jpeg() { return this }, toBuffer: async () => bytes }),
    withDesignProviderFallback: primary => primary(),
    availableGroqCompletion: async (_client, request, _env, options) => { calls.push({ request, options }); return { choices: [{ message: { content: JSON.stringify(require('./identityResponse.fixture.cjs')(request)) } }] } },
    resilientCompletion: async (_client, request, options) => {
      calls.push({ request, options })
      if (malformedFirst && calls.length === 1) return { choices: [{ message: { content: '{invalid json' } }] }
      if (fail && request.messages[1].content[0].text.includes('Reference 2')) throw Object.assign(Error('Provider temporarily unavailable'), { status: 503 })
      return { choices: [{ message: { content: JSON.stringify(require('./identityResponse.fixture.cjs')(request)) } }] }
    },
  })
  return { db, cache, calls, analyzer, recover: () => { fail = false } }
}
test('only invalid responses get one compact repair call', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const fixture = setup(false, true)
    await fixture.analyzer.analyzeDesignReferences(fixture.db, { referenceImages: seeds[1].referenceImages })
    assert.equal(fixture.calls.length, 12)
    assert.equal(fixture.calls[1].request.messages.length, 2)
    assert.match(fixture.calls[1].request.messages[1].content.at(-1).text, /Repair the draft/)
    assert.equal(fixture.calls[2].request.messages[1].content.length, 2)
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})
test('completed references are cached and missing body/CTA slots do not trigger retries', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const fixture = setup()
    const input = { referenceImages: seeds[1].referenceImages }
    const first = await fixture.analyzer.analyzeDesignReferences(fixture.db, input)
    assert.equal(fixture.calls.length, 11)
    assert.equal(fixture.cache.size, 11)
    assert.equal(first.variants[0].nodes.some(n => n.text?.includes('{{cta}}')), false)
    await fixture.analyzer.analyzeDesignReferences(fixture.db, input)
    assert.equal(fixture.calls.length, 11)
    assert.ok(fixture.calls.every(c => c.options.maxWaitMs <= 30000))
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})
test('a later provider failure preserves earlier drafts for the next attempt', async () => {
  const old = process.env.GROQ_API_KEY; process.env.GROQ_API_KEY = 'test'
  try {
    const fixture = setup(true), input = { referenceImages: seeds[1].referenceImages }
    await assert.rejects(fixture.analyzer.analyzeDesignReferences(fixture.db, input), /temporarily unavailable/)
    assert.equal(fixture.cache.size, 1)
    fixture.recover()
    await fixture.analyzer.analyzeDesignReferences(fixture.db, input)
    assert.equal(fixture.calls.length, 12)
    assert.equal(fixture.cache.size, 11)
  } finally { if (old === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = old }
})

