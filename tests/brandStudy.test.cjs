const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), crypto = require('node:crypto'), { z } = require('zod'), { stripTypeScriptTypes } = require('node:module')
const fixture = require('./designStudy.fixture.cjs')
function load(file, names, deps = {}) { return new Function(...Object.keys(deps), stripTypeScriptTypes(fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, ''), { mode: 'transform' }) + `;return {${names.join(',')}}`)(...Object.values(deps)) }
const { referenceSchema } = load('lib/designs/global/types.ts', ['referenceSchema'], { z })
const { designStudySchema } = load('lib/designs/global/study.ts', ['designStudySchema'], { z, referenceSchema })
const store = load('lib/designs/global/store.ts', ['selectBrandFamilies', 'DesignLibraryError'], { ...crypto, designStudySchema })
const brand = load('lib/designs/global/brandCarousel.ts', ['resolveBrandStudy', 'brandCarouselContent', 'persistBrandCarousel'], { z, designStudySchema, DesignLibraryError: store.DesignLibraryError })
function database() {
  const tables = { flows: [{ id: 'brand-a', brandContext: { name: 'Test brand', designs: [{ id: 'starter', source: 'legacy' }] } }, { id: 'brand-b', brandContext: { designs: [] } }], globalDesignStudies: [{ _id: 'saved', id: 'saved', study: structuredClone(fixture.study()) }] }
  const get = (row, path) => path.split('.').reduce((value, key) => value?.[key], row)
  const match = (row, query) => Object.entries(query).every(([key, value]) => value && value.$exists !== undefined ? (get(row, key) !== undefined) === value.$exists : JSON.stringify(get(row, key)) === JSON.stringify(value))
  const set = (row, key, value) => { const parts = key.split('.'); let target = row; for (const part of parts.slice(0, -1)) target = target[part] ||= {}; target[parts.at(-1)] = structuredClone(value) }
  const db = { collection: name => ({
    findOne: async query => structuredClone((tables[name] || []).find(row => match(row, query)) || null),
    updateOne: async (query, update, options) => { const rows = tables[name] ||= []; let row = rows.find(row => match(row, query)); const inserted = !row; if (!row && !options?.upsert) return { matchedCount: 0 }; if (!row) { row = { ...query }; rows.push(row) } for (const [key, value] of Object.entries({ ...(inserted ? update.$setOnInsert : {}), ...update.$set })) set(row, key, value); return { matchedCount: 1 } },
    find: query => { const rows = (tables[name] || []).filter(row => match(row, query)); return { sort: () => ({ limit: () => ({ next: async () => structuredClone(rows[0] || null) }) }) } },
  }) }
  return { db, tables }
}

test('brands can import saved studies alone, pin their DNA, and retain older designs', async () => {
  const { db, tables } = database()
  const result = await store.selectBrandFamilies(db, 'brand-a', [], ['saved'])
  const design = result.brandContext.designs.find(d => d.source === 'study')
  assert.equal(design.id, 'study-saved'); assert.ok(result.brandContext.designs.some(d => d.id === 'starter'))
  assert.equal(tables.brandDesignStudies.length, 1)
  const originalName = tables.brandDesignStudies[0].study.name
  tables.globalDesignStudies[0].study.name = 'Changed global study'
  const pinned = await brand.resolveBrandStudy(db, 'brand-a', design.id)
  assert.equal(pinned.study.name, originalName)
  await store.selectBrandFamilies(db, 'brand-a', [], ['saved', 'saved'])
  assert.equal(tables.brandDesignStudies.length, 1)
  await assert.rejects(() => store.selectBrandFamilies(db, 'brand-a', [], []), /between 1 and 24/)
  await assert.rejects(() => brand.resolveBrandStudy(db, 'brand-b', design.id), /this brand/)
})

test('copy conversion preserves slide boundaries, body, bullets and final CTA without adding claims', () => {
  const copy = { slides: [{ headline: 'One', body: 'Original body', bullets: ['First', 'Second'] }, { headline: 'Two', body: '' }], cta: 'Discover more' }
  assert.equal(brand.brandCarouselContent(copy), 'Slide 1\nOne\nOriginal body\nFirst\nSecond\n\nSlide 2\nTwo\nDiscover more')
  assert.throws(() => brand.brandCarouselContent({ slides: [{ headline: 'One' }] }))
  assert.throws(() => brand.brandCarouselContent({ slides: [{ headline: 'One' }, {}] }), /no copy/)
})

test('completed brand runs persist ordinary carousel pages idempotently with identity provenance', async () => {
  const { db, tables } = database()
  const post = { flowId: 'brand-a', name: 'Test post', design: { id: 'study-saved', source: 'study' }, copy: { slides: [] } }
  const result = { id: 'carousel_test', slides: [{ slideNumber: 1, url: '/api/uploads/first' }, { slideNumber: 2, url: '/api/uploads/second' }] }
  const canvas = await brand.persistBrandCarousel(db, post, result)
  await brand.persistBrandCarousel(db, post, result)
  assert.equal(tables.canvases.length, 1); assert.equal(canvas.flowId, 'brand-a'); assert.equal(canvas.type, 'carousel')
  assert.equal(canvas.pages.length, 2); assert.equal(canvas.pages[1].nodes[0].src, result.slides[1].url)
  assert.equal(canvas.pages[0].nodes[0].height, 1350); assert.equal(canvas.designSelection.id, 'study-saved')
  assert.equal(canvas._id, undefined)
})

test('brand endpoint routes selected identity and exact copy into automatic pipeline and scopes run reads', async () => {
  const { db, tables } = database(); await store.selectBrandFamilies(db, 'brand-a', [], ['saved'])
  const calls = []
  const api = load('lib/handlers/brandCarouselHandler.ts', ['handleBrandCarousel'], { ...crypto, ...brand, DesignLibraryError: store.DesignLibraryError,
    NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) },
    createCarouselRun: async (_db, input, context) => { calls.push({ input, context }); return { id: input.requestId, status: 'queued' } },
    readCarouselRun: async (_db, id) => ({ id }), kickCarouselRun: () => {}, retryCarouselRun: async (_db, id) => ({ id, status: 'queued' }),
  })
  const copy = { slides: [{ headline: 'One' }, { headline: 'Two' }] }
  const request = body => new Request('http://localhost/api/brand-carousel', { method: 'POST', body: JSON.stringify(body) })
  const value = await api.handleBrandCarousel(db, request({ flowId: 'brand-a', designId: 'study-saved', ideaId: 'idea', copy }))
  assert.equal(value.status, 202); assert.equal(calls.length, 1)
  assert.equal(calls[0].input.carouselContent, 'Slide 1\nOne\n\nSlide 2\nTwo')
  assert.equal(calls[0].context.savedStudy.name, fixture.study().name)
  assert.equal(calls[0].context.brandPost.flowId, 'brand-a')
  tables.globalCarouselRuns = [{ _id: 'carousel_private', id: 'carousel_private', brandPost: { flowId: 'brand-a', ideaId: 'idea', design: { id: 'study-saved' } } }]
  const otherBrand = await api.handleBrandCarousel(db, new Request('http://localhost/api/brand-carousel?flowId=brand-b&designId=study-saved&ideaId=idea&runId=carousel_private'))
  assert.equal(otherBrand.body, null)
  const unselected = await api.handleBrandCarousel(db, request({ flowId: 'brand-b', designId: 'study-saved', ideaId: 'idea', copy }))
  assert.equal(unselected.status, 400); assert.equal(calls.length, 1)
})
