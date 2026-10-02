const { test } = require('node:test')
const assert = require('node:assert/strict')
const { z } = require('zod')
const { load, seeds, types, resolve, generation } = require('./globalDesigns.test.cjs')
const { ensureFamilyVariations } = load('lib/designs/global/variations.ts', ['ensureFamilyVariations'], types)
const { validateIdentityVariants, compositionFingerprint } = load('lib/designs/global/analyze.ts', ['validateIdentityVariants', 'compositionFingerprint'], { ...types, z })
const { variantsForImagery } = load('lib/designs/global/imagery.ts', ['variantsForImagery'])
const fixture = require('./identityResponse.fixture.cjs')
const variants = mode => validateIdentityVariants(fixture({ messages: [{ content: `Required imagery: ${mode}` }] }).variants, mode, 1080, 1350)
const family = () => types.familySchema.parse({ ...seeds[1], identityVersion: 1, variants: ['cutout', 'background', 'none'].flatMap(variants) })

test('identity families preserve AI compositions and expose each imagery group', () => {
  const input = family()
  assert.deepEqual(ensureFamilyVariations(input), input)
  for (const mode of ['cutout', 'background', 'none']) {
    assert.equal(variantsForImagery(input, mode).length, 3)
    const plan = generation.globalLayoutPlan(input, 'global-test', { headline: 'Purpose matters' }, mode)
    assert.equal(plan.imageDisposition, mode)
    assert.ok(plan.slots.every(s => s.variantId.startsWith(mode)))
  }
  assert.throws(() => types.familySchema.parse({ ...input, variants: input.variants.filter(v => v.imagery !== 'none') }), /none needs/)
})
test('duplicate compositions across families and cutout text collisions are rejected', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: cutout' }] }).variants
  assert.throws(() => validateIdentityVariants(raw, 'cutout', 1080, 1350, new Set([compositionFingerprint(raw[0])])), /duplicates another/)
  Object.assign(raw[0].nodes.find(n => n.type === 'text'), {x: 0, y: 0, width: 1080, height: 1350})
  assert.throws(() => validateIdentityVariants(raw, 'cutout', 1080, 1350), /overlaps the cutout/)
})
test('identity shadows resolve brand colors and remain on editable shape nodes', () => {
  const input = family(), variant = input.variants.find(v => v.imagery === 'none')
  const canvas = resolve.resolveVariant(input, variant, {}, { headline: 'Purpose matters' })
  const motif = canvas.nodes.find(n => n.id === 'motif')
  assert.equal(motif.type, 'shape')
  assert.match(motif.boxShadow, /2px 2px 8px #00000033/)
})

test('cutout collisions use negative space without removing or shifting the copy', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: cutout' }] }).variants
  raw[0].nodes.find(n => n.type === 'text').y = 700
  const before = structuredClone(raw[0].nodes.find(n => n.type === 'text'))
  const result = validateIdentityVariants(raw, 'cutout', 1080, 1350)
  const image = result[0].nodes.find(n => n.type === 'image')
  const text = result[0].nodes.find(n => n.type === 'text')
  assert.deepEqual(text, before)
  assert.ok(image.y + image.height <= text.y || image.y >= text.y + text.height || image.x + image.width <= text.x || image.x >= text.x + text.width)
  assert.equal(image.objectFit, 'contain')
  assert.equal(raw[0].nodes.find(n => n.type === 'image').y, 620)
})

test('small typography values and off-canvas footers are normalized locally', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: none' }] }).variants
  raw[0].nodes.push({ id: 'author', type: 'text', text: '{{author}}', x: 90, y: 1340, width: 400, height: 60, fontFamily: 'brand.bodyFont', color: 'brand.textPrimary', fontSize: 10, minFontSize: 6 })
  const result = validateIdentityVariants(raw, 'none', 1080, 1350)
  const footer = result[0].nodes.find(n => n.id === 'author')
  assert.equal(footer.y, 1290)
  assert.equal(footer.fontSize, 12)
  assert.equal(footer.minFontSize, 12)
  assert.equal(raw[0].nodes.at(-1).y, 1340)
})

test('overlapping secondary copy moves to free space while preserving the headline', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: none' }] }).variants
  const headline = raw[0].nodes.find(n => n.type === 'text')
  raw[0].nodes.push({ ...headline, id: 'author', text: '{{author}}', width: 200, height: 40 })
  raw[0].patterns = [{ id: 'Decorative_Dots', shape: 'ellipse', x: 900, y: 900, columns: 2, rows: 2, stepX: 20, stepY: 20, size: 4, fill: 'brand.accent' }]
  const result = validateIdentityVariants(raw, 'none', 1080, 1350)[0]
  const author = result.nodes.find(n => n.id === 'author')
  assert.deepEqual(result.nodes.find(n => n.id === headline.id), headline)
  assert.ok(author.x + author.width <= headline.x || author.x >= headline.x + headline.width || author.y + author.height <= headline.y || author.y >= headline.y + headline.height)
  assert.equal(result.nodes.filter(n => n.id.startsWith('pattern-')).length, 4)
})

test('copy crossing a panel edge is placed fully inside or outside its panel', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: none' }] }).variants
  const headline = raw[0].nodes.find(n => n.type === 'text')
  const panel = { id: 'reading-panel', type: 'shape', shape: 'rect', x: headline.x, y: headline.y + 20, width: headline.width + 30, height: headline.height + 60, fill: 'brand.secondary' }
  raw[0].nodes.unshift(panel)
  const result = validateIdentityVariants(raw, 'none', 1080, 1350)[0]
  const text = result.nodes.find(n => n.id === headline.id)
  assert.notEqual(text.y, headline.y)
  assert.equal(text.text, headline.text)
})

test('background objects preserve gradients as editable full-canvas nodes', () => {
  const raw = fixture({ messages: [{ content: 'Required imagery: none' }] }).variants
  raw[0].background = { gradientType: 'linear', angle: 90, stops: [{ color: 'brand.primary', position: 0, alpha: 100 }, { color: 'brand.background', position: 100, alpha: 100 }] }
  raw[1].background = { color: 'brand.secondary' }
  raw[1].nodes[0].shadow = null
  const result = validateIdentityVariants(raw, 'none', 1080, 1350)
  assert.equal(result[0].background, 'brand.background')
  assert.equal(result[0].nodes[0].type, 'gradient')
  assert.equal(result[0].nodes[0].width, 1080)
  assert.deepEqual(result[0].nodes[0].stops, raw[0].background.stops)
  assert.equal(result[1].background, 'brand.secondary')
  assert.equal(result[1].nodes[0].shadow, undefined)
})
