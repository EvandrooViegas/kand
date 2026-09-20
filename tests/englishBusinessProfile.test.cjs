const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const source = stripTypeScriptTypes(fs.readFileSync('lib/services/englishBusinessProfile.ts', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''))

function setup(complete) {
  let calls = 0
  class Groq { constructor(options) {
    assert.equal(options.maxRetries, 0)
    this.chat = { completions: { create: async request => {
      calls++
      assert.equal(request.model, 'qwen/qwen3.8-27b')
      return { choices: [{ message: { content: JSON.stringify(await complete(JSON.parse(request.messages[1].content))) } }] }
    } } }
  } }
  const engine = new Function('Groq', 'createHash', 'process', source + ';return {businessTranslationInput,validateEnglishTranslation,ensureEnglishBusinessProfile}')(Groq, require('node:crypto').createHash, { env: { GROQ_API_KEY: 'test' } })
  return { ...engine, calls: () => calls }
}

test('translation preserves proper metadata, post language and visual identity, then reuses the saved English profile', async () => {
  let flow = { id: 'brand', brandContext: { name: 'KACHICA', about: 'Descrição detalhada.', services: ['Gestão — Conteúdo.'], projects: [{ name: 'Prumo Soalheiro', description: 'Criação de website.', sourceUrl: 'https://source.test', id: 'project-1' }], language: 'Portuguese', colors: ['#123456'], logo: 'logo.png', fonts: ['Inter'], imageDisposition: 'background' } }
  const engine = setup(async () => ({ about: 'A detailed description.', services: ['Management — Content.'], projects: [{ name: 'Prumo Soalheiro', description: 'Website creation.', sourceUrl: 'untrusted' }], language: 'English', colors: ['wrong'] }))
  const db = { collection: () => ({ findOne: async () => structuredClone(flow), updateOne: async (filter, update) => {
    assert.equal(filter['brandContext.about'], 'Descrição detalhada.')
    for (const [key, value] of Object.entries(update.$set)) if (key.startsWith('brandContext.')) flow.brandContext[key.slice(13)] = value
    return { matchedCount: 1 }
  } }) }
  const [one, two] = await Promise.all([engine.ensureEnglishBusinessProfile(db, 'brand'), engine.ensureEnglishBusinessProfile(db, 'brand')])
  assert.equal(engine.calls(), 1)
  assert.equal(one.about, 'A detailed description.')
  assert.deepEqual(one, two)
  assert.equal(one.language, 'Portuguese')
  assert.deepEqual(one.colors, ['#123456'])
  assert.equal(one.logo, 'logo.png')
  assert.equal(one.projects[0].sourceUrl, 'https://source.test')
  assert.equal(one.projects[0].id, 'project-1')
  assert.equal(one.profileLanguage, 'en')
  await engine.ensureEnglishBusinessProfile(db, 'brand')
  assert.equal(engine.calls(), 1)
})

test('incomplete translation cannot discard services or empty existing information', async () => {
  const engine = setup(async () => ({ about: '', services: ['Only one'] }))
  let saved = false
  const db = { collection: () => ({ findOne: async () => ({ brandContext: { about: 'Original', services: ['One', 'Two'] } }), updateOne: async () => { saved = true } }) }
  await assert.rejects(engine.ensureEnglishBusinessProfile(db, 'brand'), /incomplete/)
  assert.equal(saved, false)
  assert.equal(engine.calls(), 1)
})

test('translation cannot overwrite concurrent manual edits', async () => {
  const engine = setup(async () => ({ about: 'English text' }))
  const db = { collection: () => ({ findOne: async () => ({ brandContext: { about: 'Original' } }), updateOne: async () => ({ matchedCount: 0 }) }) }
  await assert.rejects(engine.ensureEnglishBusinessProfile(db, 'brand'), /profile changed/)
  assert.equal(engine.calls(), 1)
})

test('large profiles fail explicitly instead of silently truncating or retrying', async () => {
  const engine = setup(async () => { throw Error('Should not run') })
  const db = { collection: () => ({ findOne: async () => ({ brandContext: { about: 'a'.repeat(27000) } }) }) }
  await assert.rejects(engine.ensureEnglishBusinessProfile(db, 'brand'), /too long/)
  assert.equal(engine.calls(), 0)
})
