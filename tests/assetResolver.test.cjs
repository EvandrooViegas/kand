const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/assetResolverHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '')
function engine(fetch) {
  return vm.runInNewContext(stripTypeScriptTypes(source) + '\n({ searchUnsplash, resolveSlot })', {
    fetch, console, Math: Object.assign(Object.create(Math), { random: () => 0 }),
  })
}
const photo = id => ({ id, urls: { regular: `https://images.example/${id}` } })
const slot = { search_queries: ['hands testing soil', 'gardener holding soil'], search_keywords: ['garden'], visual_purpose: 'Check soil' }

test('concurrent slots reserve distinct photos from overlapping results', async () => {
  const e = engine(async () => ({ ok: true, json: async () => ({ results: [photo('a'), photo('b')] }) }))
  const used = new Set()
  const results = await Promise.all([e.searchUnsplash(slot, 'key', used), e.searchUnsplash(slot, 'key', used)])
  assert.equal(new Set(results.map(r => r.unsplash_id)).size, 2)
})

test('exhausted results retry a standalone alternative query', async () => {
  const queries = []
  const e = engine(async url => {
    queries.push(new URL(url).searchParams.get('query'))
    return { ok: true, json: async () => ({ results: queries.length === 1 ? [photo('used')] : [photo('new')] }) }
  })
  assert.equal((await e.searchUnsplash(slot, 'key', new Set(['used']))).unsplash_id, 'new')
  assert.deepEqual(queries, slot.search_queries)
})

test('legacy tags work and empty searches do not request arbitrary photos', async () => {
  const queries = []
  const e = engine(async url => {
    queries.push(new URL(url).searchParams.get('query'))
    return { ok: true, json: async () => ({ results: [photo('legacy')] }) }
  })
  await e.searchUnsplash({ search_keywords: ['garden', 'soil'] }, 'key', new Set())
  assert.deepEqual(queries, ['garden soil'])
  assert.equal(await e.searchUnsplash({ search_keywords: [] }, 'key', new Set()), null)
  assert.equal(queries.length, 1)
})

test('text-only slides never fetch an image', async () => {
  const e = engine(async () => { throw new Error('Unexpected request') })
  const result = await e.resolveSlot(null, { ...slot, needs_visual: false, preferred_source: 'none' }, null, 'key', null, new Set())
  assert.equal(result.resolvedAsset, null)
})

test('isolated subject ranking prefers a relevant portrait over crowds', async () => {
  const e = engine(async () => ({ ok: true, json: async () => ({ results: [
    { ...photo('crowd'), alt_description: 'group of people in a crowd' },
    { ...photo('portrait'), alt_description: 'single person studio portrait' },
  ] }) }))
  const result = await e.searchUnsplash({ ...slot, treatment: 'isolated_subject', search_keywords: ['person'] }, 'key', new Set())
  assert.equal(result.unsplash_id, 'portrait')
})
