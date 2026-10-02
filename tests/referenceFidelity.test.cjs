const { test } = require('node:test')
const assert = require('node:assert/strict')
const { load, seeds, resolve, generation, types } = require('./globalDesigns.test.cjs')
const { ensureFamilyVariations } = load('lib/designs/global/variations.ts', ['ensureFamilyVariations'], types)
const { validateReferenceLayout } = load('lib/designs/global/analyze.ts', ['validateReferenceLayout'], { z: require('zod').z, ...types })

test('overlapping headline and row panels are rejected; contained row copy is allowed', () => {
  const panel = { id: 'step-panel', type: 'shape', x: 100, y: 300, width: 800, height: 120, fill: 'brand.primary' }
  const row = { id: 'step-copy', type: 'text', text: '{{step.1}}', x: 120, y: 320, width: 760, height: 70 }
  const headline = { id: 'headline', type: 'text', text: '{{headline}}', x: 100, y: 140, width: 800, height: 120 }
  assert.doesNotThrow(() => validateReferenceLayout({ nodes: [panel, row, headline] }))
  assert.throws(() => validateReferenceLayout({ nodes: [panel, row, { ...headline, y: 260 }] }), /overlap/i)
  const family = structuredClone(seeds[1])
  family.variants[1].nodes = [panel, { ...row, fontFamily: 'brand.bodyFont', fontSize: 30, color: 'brand.onPrimary' }, { ...headline, fontFamily: 'brand.headingFont', fontSize: 60, color: 'brand.textPrimary' }]
  for (const variant of ensureFamilyVariations(family).variants.filter(v => v.role !== 'cover')) assert.doesNotThrow(() => validateReferenceLayout(variant))
})

test('the first reference variants retain every measured node and text box', () => {
  const family = structuredClone(seeds[1])
  const expanded = ensureFamilyVariations(family)
  assert.deepEqual(expanded.variants[0].nodes, family.variants[0].nodes)
  assert.deepEqual(expanded.variants.find(v => v.id === 'content-1').nodes, family.variants[1].nodes)
})

test('reference artwork and wording are preview-only, posts use replacement assets', () => {
  const family = structuredClone(seeds[1])
  const variant = family.variants[0]
  const headline = variant.nodes.find(n => n.text === '{{headline}}')
  headline.referenceText = 'UMA VENDA NÃO\nCOMEÇA NO LINK'
  headline.highlight = 'none'
  variant.nodes.unshift({ id: 'hand', type: 'image', src: '{{image.primary}}', imageType: 'cutout', x: 280, y: 600, width: 560, height: 750, objectFit: 'contain', referenceAsset: { src: '/design-references/hand.jpg', x: .25, y: .44, width: .5, height: .56 } })
  const preview = resolve.resolveVariant(family, variant, {}, { headline: 'Replacement headline' }, 0, '', { preview: true, referencePreview: true })
  assert.equal(preview.nodes.find(n => n.id === 'hand').src, '/design-references/hand.jpg')
  assert.equal(preview.nodes.find(n => n.id === headline.id).text, headline.referenceText)
  assert.ok(preview.nodes.find(n => n.id === 'hand').referenceCrop)
  const post = resolve.resolveVariant(family, variant, {}, { headline: 'Replacement headline' }, 0, '/replacement.png')
  assert.equal(post.nodes.find(n => n.id === 'hand').src, '/replacement.png')
  assert.equal(post.nodes.find(n => n.id === 'hand').referenceCrop, undefined)
  assert.equal(post.nodes.find(n => n.id === headline.id).text, 'Replacement headline')
})

test('post plans preserve cutout gestures and props instead of requesting scenery', () => {
  const family = structuredClone(seeds[1])
  family.designType = 'cutout'
  for (const variant of family.variants) variant.nodes.unshift({ id: 'hand', type: 'image', src: '{{image.primary}}', imageType: 'cutout', imageBrief: 'Monochrome hand tapping a floating app tile, frontal view.', x: 280, y: 600, width: 560, height: 750, objectFit: 'contain' })
  const plan = generation.globalLayoutPlan(family, 'global-test', { headline: 'Tap to pay' })
  assert.equal(plan.imageDisposition, 'cutout')
  assert.equal(plan.slots[0].treatment, 'cutout')
  assert.equal(plan.slots[0].background, false)
  assert.match(plan.slots[0].brief, /hand tapping a floating app tile/)
  assert.match(plan.slots[0].brief, /transparent background/)
})
