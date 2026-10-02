const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const { z } = require('zod')
const crypto = require('node:crypto')

function load(file, names, dependencies = {}) {
  const source = fs.readFileSync(file, 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(source, { mode: 'transform' }) + `;return {${names.join(',')}}`)(...Object.values(dependencies))
}
const types = load('lib/designs/global/types.ts', ['familySchema', 'variantSchema', 'referenceSchema', 'COLOR_TOKENS', 'FONT_TOKENS', 'SLOT_NAMES', 'uniqueNodeIds'], { z })
const { INITIAL_GLOBAL_FAMILIES: seeds } = load('lib/designs/global/seeds.ts', ['INITIAL_GLOBAL_FAMILIES'])
const resolve = load('lib/designs/global/resolve.ts', ['resolveBrandTokens', 'resolveVariant', 'chooseVariant', 'composeVariant', 'contentSlots', 'templateFromCanvas', 'SAMPLE_COPY'])
const variations = load('lib/designs/global/variations.ts', ['ensureFamilyVariations'], types)
const store = load('lib/designs/global/store.ts', ['DesignLibraryError', 'ensureGlobalDesignLibrary', 'getGlobalVersion', 'listGlobalDesigns', 'getGlobalRecord', 'saveGlobalDraft', 'publishGlobalDesign', 'retireGlobalDesign', 'selectBrandFamilies', 'hydrateBrandFamilies'], { INITIAL_GLOBAL_FAMILIES: seeds, ...types, ...variations })
const generation = load('lib/designs/global/generation.ts', ['chooseBrandFamily', 'globalLayoutPlan', 'renderGlobalPost'], { ...resolve, ...store, ...variations })
const auth = load('lib/designs/global/admin.ts', ['validAdminKey', 'adminSession', 'isDesignAdmin', 'requireDesignAdmin'], { ...crypto })

function memoryDb() {
  const tables = new Map()
  const get = (object, path) => path.split('.').reduce((v, key) => v?.[key], object)
  const set = (object, path, value) => { const keys = path.split('.'); const last = keys.pop(); let current = object; for (const key of keys) current = current[key] ||= {}; current[last] = structuredClone(value) }
  const matches = (doc, query) => Object.entries(query).every(([key, value]) => value && typeof value === 'object' && '$exists' in value ? (get(doc, key) !== undefined) === value.$exists : JSON.stringify(get(doc, key)) === JSON.stringify(value))
  return { tables, collection(name) {
    if (!tables.has(name)) tables.set(name, [])
    const list = tables.get(name)
    return {
      find: query => ({ toArray: async () => structuredClone(list.filter(doc => matches(doc, query))) }),
      findOne: async query => structuredClone(list.find(doc => matches(doc, query)) || null),
      insertOne: async doc => { if (list.some(d => d._id !== undefined && d._id === doc._id)) throw Object.assign(Error('Duplicate'), { code: 11000 }); list.push(structuredClone(doc)); return {} },
      updateOne: async (query, update, options = {}) => {
        let doc = list.find(doc => matches(doc, query)); const found = !!doc
        if (!doc && options.upsert) { doc = { ...query, ...structuredClone(update.$setOnInsert || {}) }; list.push(doc) }
        if (!doc) return { matchedCount: 0 }
        for (const [key, value] of Object.entries(update.$set || {})) set(doc, key, value)
        for (const [key, value] of Object.entries(update.$inc || {})) set(doc, key, (get(doc, key) || 0) + value)
        return { matchedCount: found ? 1 : 0 }
      },
    }
  } }
}

test('six references form three valid semantic families with no baked reference imagery or text', () => {
  assert.equal(seeds.length, 3)
  for (const family of seeds) {
    types.familySchema.parse(family)
    assert.equal(family.referenceImages.length, 2)
    assert.deepEqual([family.width, family.height], [1080, 1350])
    for (const variant of family.variants) for (const node of variant.nodes) {
      if (node.type === 'image') assert.ok(['{{image.primary}}', '{{brand.logo}}'].includes(node.src))
      if (node.type === 'text') assert.match(node.text, /\{\{[^}]+\}\}/)
    }
  }
  assert.throws(() => types.familySchema.parse({ ...seeds[0], referenceImages: seeds[0].referenceImages.slice(0, 1) }))
  assert.throws(() => types.variantSchema.parse({ ...seeds[1].variants[0], nodes: [{ ...seeds[1].variants[0].nodes[0], color: '#E5B52A' }] }))
})

test('brand adaptation changes identity while preserving geometry and source templates', () => {
  const family = seeds[1], variant = family.variants[0], original = JSON.stringify(family)
  const a = resolve.resolveVariant(family, variant, { colors: ['#e03020', '#ffffff', '#ffcc00'], fonts: ['Oswald', 'Inter'] }, { headline: 'Build better habits', cta: 'Read more' })
  const b = resolve.resolveVariant(family, variant, { colors: ['#123456', '#ffeecc', '#0077aa'], fonts: ['Montserrat', 'Roboto'] }, { headline: 'Build better habits', cta: 'Read more' })
  const headingA = a.nodes.find(n => n.id === 'headline'), headingB = b.nodes.find(n => n.id === 'headline')
  for (const key of ['x', 'y', 'width', 'height']) assert.equal(headingA[key], headingB[key])
  assert.equal(headingA.fontFamily, 'Oswald'); assert.equal(headingB.fontFamily, 'Montserrat')
  assert.notDeepEqual(a.classes, b.classes)
  assert.equal(JSON.stringify(family), original)
})

test('every two-reference family expands into three covers and ten structurally distinct content designs', () => {
  for (const source of seeds) {
    const family = types.familySchema.parse(variations.ensureFamilyVariations(source))
    assert.equal(family.variants.filter(variant => variant.role === 'cover').length, 3)
    const contents = family.variants.filter(variant => variant.role !== 'cover')
    assert.equal(contents.length, 10)
    assert.equal(new Set(contents.map(variant => variant.nodes.map(node => `${node.type}:${node.x}:${node.y}:${node.width}:${node.height}:${node.rotation || 0}`).join('|'))).size, 10)
    assert.ok(contents.every(variant => variant.nodes.filter(node => node.text?.includes('{{body}}')).length === 1))
  }
  const [momentum, editorial, photographic] = seeds.map(source => variations.ensureFamilyVariations(source))
  assert.ok(momentum.variants.every(variant => variant.nodes.some(node => node.id.startsWith('diamond-'))))
  assert.ok(editorial.variants.every(variant => variant.nodes.find(node => node.text === '{{headline}}')?.highlight === 'background'))
  assert.ok(photographic.variants.every(variant => variant.nodes.some(node => node.src === '{{image.primary}}')))
  const fingerprints = [momentum, editorial, photographic].map(family => family.variants.map(variant => variant.nodes.map(node => `${node.type}:${node.id.replace(/-\d+$/, '')}`).join('|')).join('::'))
  assert.equal(new Set(fingerprints).size, 3)
})

test('photo doodle upgrades stay within the template node budget', () => {
  const source = seeds.find(family => family.variants.some(variant => variant.nodes.some(node => node.src === '{{image.primary}}')))
  const expanded = variations.ensureFamilyVariations(source)
  const overloaded = { ...expanded, analysis: expanded.analysis + ' Hand-drawn script with neon accents.', variants: expanded.variants.map(variant => ({ ...variant,
    nodes: [...variant.nodes, ...Array.from({ length: 1700 }, (_, index) => ({ id: `star-field-${index}`, type: 'shape', shape: 'ellipse', x: index % 1080, y: index % 1350, width: 4, height: 4, fill: 'brand.accent' }))] })) }
  const limited = variations.ensureFamilyVariations(overloaded)
  assert.ok(limited.variants.every(variant => variant.nodes.length <= 1500))
  assert.ok(limited.variants.every(variant => variant.nodes.some(node => node.text?.includes('{{headline}}'))))
  types.familySchema.parse(limited)
})

test('carousels use variants from one family and produce normal editable Canvas nodes', () => {
  const family = seeds[1], copy = { format: 'carousel', slides: [{ headline: 'A better beginning' }, { headline: 'Small steps', purpose: 'steps', body: '1. Decide\n2. Begin' }, { headline: 'Start today', body: 'Make the next step count.', cta: 'Learn more' }] }
  const canvas = generation.renderGlobalPost(family, { id: 'brand', name: 'Brand' }, copy, { slots: [] }, { id: 'global-' + family.id }, crypto.randomUUID)
  assert.match(canvas.pages[0].globalVariantId, /^cover-/)
  assert.equal(new Set(canvas.pages.slice(1).map(p => p.globalVariantId)).size, 2)
  assert.equal(canvas.height, 1350)
  assert.equal(new Set(canvas.pages.flatMap(p => p.nodes.map(n => n.id))).size, canvas.pages.reduce((n, p) => n + p.nodes.length, 0))
  assert.ok(canvas.pages.every(p => p.nodes.some(n => n.type === 'text')))
  assert.equal(canvas.designSelection.globalFamilyId, family.id)
  assert.equal(canvas.designInput.resolvedPlan.layoutPlan.source, 'global')
})

test('generation creates coordinated layout variations while keeping one design family', () => {
  const family = seeds[2]
  const copy = { format: 'carousel', slides: Array.from({ length: 5 }, (_, index) => ({ headline: `Distinct headline ${index + 1}`, body: index ? `Supporting copy for slide ${index + 1}.` : '', cta: index === 4 ? 'Get started' : '' })) }
  const plan = generation.globalLayoutPlan(family, `global-${family.id}`, copy)
  assert.equal(plan.slots.every(slot => slot.compositionId === 'structural'), true)
  assert.equal(new Set(plan.slots.map(slot => slot.variantId)).size, 5)
  const canvas = generation.renderGlobalPost(family, { id: 'brand', name: 'Brand' }, copy, { slots: plan.slots.map(slot => ({ slot_id: slot.slot_id, resolvedAsset: { url: '/photo.jpg' } })) }, { id: `global-${family.id}` }, crypto.randomUUID)
  assert.equal(canvas.pages.every(page => page.globalCompositionId === 'structural'), true)
  assert.ok(canvas.pages.every(page => page.nodes.every(node => !node.templateBinding || ['text','shape','image','gradient'].includes(node.type))))
  const headlinePositions = canvas.pages.map(page => page.nodes.find(node => node.templateBinding?.text === '{{headline}}')).map(node => `${node.x}:${node.y}:${node.width}:${node.textAlign || 'left'}`)
  assert.ok(new Set(headlinePositions).size >= 3)
})

test('photo slots require resolved assets, preserve crop/overlay, and never use reference screenshots', () => {
  const family = seeds[2], variant = family.variants[0]
  assert.throws(() => resolve.resolveVariant(family, variant, {}, { headline: 'Escape the routine' }), /needs a photograph/)
  const canvas = resolve.resolveVariant(family, variant, {}, { headline: 'Escape the routine' }, 0, '/api/uploads/new-photo')
  const photo = canvas.nodes.find(n => n.id === 'photo')
  assert.equal(photo.src, '/api/uploads/new-photo'); assert.equal(photo.height, 1350)
  assert.ok(canvas.nodes.some(n => n.type === 'gradient'))
  assert.ok(!JSON.stringify(canvas).includes('/design-references/'))
})

test('text overflow fails clearly rather than rearranging the design or deleting copy', () => {
  const portuguese = resolve.resolveVariant(seeds[2], seeds[2].variants[0], {}, { headline: 'Teste simples pode dobrar o desempenho dos anúncios', body: 'Descubra o passo a passo para otimizar seu ROI' }, 0, '/photo.jpg')
  const fitted = portuguese.nodes.find(node => node.id === 'headline')
  assert.equal(fitted.text, 'Teste simples pode dobrar o desempenho dos anúncios')
  assert.ok(fitted.fontSize < seeds[2].variants[0].nodes.find(node => node.id === 'headline').minFontSize)
  assert.ok(fitted.fontSize >= 14)
  assert.throws(() => resolve.resolveVariant(seeds[1], seeds[1].variants[1], {}, { headline: 'Test', body: 'Very long body. '.repeat(400) }), /too long/)
})

test('Canvas editing round trip preserves semantic bindings and geometry edits', () => {
  const family = seeds[2], variant = family.variants[0]
  const canvas = resolve.resolveVariant(family, variant, {}, resolve.SAMPLE_COPY, 0, '', { preview: true, placeholders: true })
  const headline = canvas.nodes.find(n => n.id === 'headline'), photo = canvas.nodes.find(n => n.id === 'photo')
  headline.x += 12; photo.x = -20
  const updated = types.variantSchema.parse(resolve.templateFromCanvas(family, variant, canvas))
  assert.equal(updated.nodes.find(n => n.id === 'headline').x, headline.x)
  assert.equal(updated.nodes.find(n => n.id === 'headline').text, '{{headline}}')
  assert.equal(updated.nodes.find(n => n.id === 'photo').src, '{{image.primary}}')
  assert.equal(updated.nodes.find(n => n.id === 'photo').x, -20)
})

test('publishing is versioned, stale edits conflict, and unpublishing preserves imports', async () => {
  const db = memoryDb()
  await store.ensureGlobalDesignLibrary(db); await store.ensureGlobalDesignLibrary(db)
  assert.equal((await store.listGlobalDesigns(db)).length, 3)
  const first = await store.getGlobalRecord(db, seeds[1].id)
  const saved = await store.saveGlobalDraft(db, { ...first.draft, name: 'Reviewed name' }, first.revision)
  await assert.rejects(store.saveGlobalDraft(db, first.draft, first.revision), /changed/)
  assert.equal((await store.getGlobalVersion(db, first.id, seeds[1].version)).name, seeds[1].name)
  const published = await store.publishGlobalDesign(db, first.id, saved.revision)
  assert.equal((await store.getGlobalVersion(db, first.id, published.publishedVersion)).name, 'Reviewed name')
  await store.retireGlobalDesign(db, first.id, published.revision)
  assert.equal((await store.listGlobalDesigns(db)).length, 2)
  assert.equal((await store.getGlobalVersion(db, first.id, seeds[1].version)).name, seeds[1].name)
})

test('brands require one family and can select and generate from multiple families', async () => {
  const db = memoryDb(); await store.ensureGlobalDesignLibrary(db)
  await db.collection('flows').insertOne({ id: 'brand', brandContext: { colors: ['#123456'], designs: [{ id: 'legacy', baseId: 'editorial' }] } })
  await assert.rejects(store.selectBrandFamilies(db, 'brand', []), /between 1 and 24/)
  const result = await store.selectBrandFamilies(db, 'brand', [seeds[0].id])
  const imports = result.brandContext.designs.filter(d => d.source === 'global')
  assert.equal(imports.length, 1)
  assert.equal(imports[0].nodes, undefined)
  assert.equal(imports[0].globalVersion, seeds[0].version)
  const selected = await generation.chooseBrandFamily(db, { ...result.brandContext, id: 'brand' }, { headline: 'A new beginning' })
  assert.equal(selected.family.id, seeds[0].id)
  const replacement = await store.selectBrandFamilies(db, 'brand', [seeds[1].id])
  assert.deepEqual(replacement.brandContext.designs.filter(d => d.source === 'global').map(d => d.globalFamilyId), [seeds[1].id])
  assert.ok(replacement.brandContext.designs.some(d => d.id === 'legacy'))
  const oldBrand = { designs: [...imports, ...replacement.brandContext.designs.filter(d => d.source === 'global')] }
  assert.equal((await store.hydrateBrandFamilies(db, oldBrand)).length, 2)
  assert.equal((await generation.chooseBrandFamily(db, oldBrand, {}, `global-${seeds[1].id}`)).family.id, seeds[1].id)
  const multiple = await store.selectBrandFamilies(db, 'brand', seeds.map(f => f.id))
  assert.equal((await store.hydrateBrandFamilies(db, multiple.brandContext)).length, 3)
  await db.collection('canvases').insertOne({ id: 'used', flowId: 'brand', designSelection: { source: 'global', globalFamilyId: seeds[0].id } })
  assert.notEqual((await generation.chooseBrandFamily(db, { ...multiple.brandContext, id: 'brand' }, {})).family.id, seeds[0].id)
  assert.equal(await generation.chooseBrandFamily(db, { id: 'empty', designs: [] }, {}), null)
})

test('admin sessions require the configured key, expire, and reject cross-origin writes', () => {
  const previous = process.env.GLOBAL_DESIGN_ADMIN_KEY
  process.env.GLOBAL_DESIGN_ADMIN_KEY = 'test-only-admin-key'
  try {
    assert.equal(auth.validAdminKey('wrong'), false)
    assert.equal(auth.validAdminKey('test-only-admin-key'), true)
    const cookie = 'kand-design-admin=' + auth.adminSession()
    assert.equal(auth.isDesignAdmin(new Request('http://localhost/api/global-designs', { headers: { cookie } })), true)
    assert.throws(() => auth.requireDesignAdmin(new Request('http://localhost/api/global-designs', { headers: { cookie, origin: 'http://elsewhere.test' } })), /origin/)
    assert.equal(auth.isDesignAdmin(new Request('http://localhost/api/global-designs', { headers: { cookie: 'kand-design-admin=0.fake' } })), false)
  } finally { if (previous === undefined) delete process.env.GLOBAL_DESIGN_ADMIN_KEY; else process.env.GLOBAL_DESIGN_ADMIN_KEY = previous }
})

test('reference analysis accepts 5 images with one target bitmap per request', async () => {
  const calls = []
  const oldKey = process.env.GROQ_API_KEY
  process.env.GROQ_API_KEY = 'test-only'
  const analyzer = load('lib/designs/global/analyze.ts', ['analyzeDesignReferences', 'normalizeReferenceVariant'], {
    ...types, ...variations, z,
    Groq: class {}, sharp: () => ({ rotate() { return this }, resize() { return this }, jpeg() { return this }, async toBuffer() { return Buffer.from('image') } }),
    readFile: async () => Buffer.from('reference'), join: require('node:path').join, randomUUID: crypto.randomUUID, createHash: crypto.createHash,
    withDesignProviderFallback: primary => primary(),
    availableGroqCompletion: async (_client, request) => { calls.push(request); return { choices: [{ message: { content: JSON.stringify(require('./identityResponse.fixture.cjs')(request)) } }] } },
    resilientCompletion: async (_client, request) => {
      calls.push(request)
      return { choices: [{ message: { content: JSON.stringify(require('./identityResponse.fixture.cjs')(request)) } }] }
    },
  })
  try {
    const references = seeds.flatMap(f => f.referenceImages).slice(0, 5)
    const family = await analyzer.analyzeDesignReferences({}, { referenceImages: references })
    assert.equal(family.referenceImages.length, 5); assert.equal(family.variants.length, 9)
    assert.equal(calls.length, 14)
    assert.equal(family.name, 'Golden Editorial')
    assert.equal(family.identityVersion, 1)
    assert.equal(family.typography.headingFallback, 'DM Sans')
    assert.equal(family.referenceStyle.accent, '#ffe05b')
    assert.ok(calls.slice(0, 5).every(call => call.messages[1].content.filter(item => item.type === 'image_url').length === 1))
    assert.deepEqual(family.variants.filter(v => v.role === 'cover').map(v => v.id), ['cutout-1', 'background-1', 'none-1'])
    assert.equal(family.variants.filter(v => v.role !== 'cover').length, 6)
    assert.equal(typeof family.variants[0].nodes[0].x, 'number')
  } finally { if (oldKey === undefined) delete process.env.GROQ_API_KEY; else process.env.GROQ_API_KEY = oldKey }
})

test('dense reference patterns expand into editable shapes without losing size progression or opacity', () => {
  const { expandReferencePatterns } = load('lib/designs/global/analyze.ts', ['expandReferencePatterns'], { ...types, z })
  const value = { ...seeds[0].variants[0], nodes: [seeds[1].variants[0].nodes.find(n => n.id === 'headline')], patterns: [{ id: 'diamonds', shape: 'rect', x: 10, y: 10, rows: 40, columns: 25, stepX: 40, stepY: 32, size: 16, endSize: 2, rotation: 45, fill: 'brand.secondary', fillAlpha: 18 }] }
  const expanded = types.variantSchema.parse(expandReferencePatterns(value))
  assert.equal(expanded.nodes.length, 1001)
  assert.equal(expanded.nodes[0].width, 16)
  assert.equal(expanded.nodes[999].width, 2)
  assert.equal(expanded.nodes[999].fillAlpha, 18)
  assert.equal(expanded.nodes.at(-1).id, 'headline')
  assert.throws(() => expandReferencePatterns({ ...value, patterns: [{ ...value.patterns[0], rows: 60, columns: 60 }] }), /1600/)
})

module.exports = { load, seeds, resolve, types, store, generation }


test('reconstruction repairs repeated and pattern-colliding IDs without dropping elements', () => {
  const { expandReferencePatterns } = load('lib/designs/global/analyze.ts', ['expandReferencePatterns'], { ...types, z })
  const headline = seeds[1].variants[0].nodes.find(n => n.id === 'headline')
  const nodes = [headline, { ...headline, x: 200 }, { ...headline, id: 'headline-duplicate-2' }, { ...headline, id: 'dots-0-0' }]
  const expanded = types.variantSchema.parse(expandReferencePatterns({ ...seeds[1].variants[0], nodes, patterns: [{ id: 'dots', shape: 'ellipse', x: 20, y: 20, rows: 1, columns: 1, stepX: 40, stepY: 40, size: 8, fill: 'brand.accent' }] }))
  assert.equal(expanded.nodes.length, 5)
  assert.equal(new Set(expanded.nodes.map(n => n.id)).size, 5)
  assert.deepEqual(expanded.nodes.slice(1).map(({ id, ...node }) => node), nodes.map(({ id, ...node }) => node))
  assert.deepEqual(types.uniqueNodeIds(expanded.nodes), expanded.nodes)
})

test('generated variants avoid collisions with inherited decorations', () => {
  const input = structuredClone(seeds[1])
  input.variants[0].nodes.push({ id: 'headline', type: 'shape', shape: 'rect', x: 20, y: 20, width: 30, height: 30, fill: 'brand.accent' })
  const family = types.familySchema.parse(variations.ensureFamilyVariations(input))
  for (const variant of family.variants) assert.equal(new Set(variant.nodes.map(n => n.id)).size, variant.nodes.length)
  assert.ok(family.variants[0].nodes.some(n => n.type === 'shape' && n.x === 20 && n.y === 20))
})
