const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const source = readFileSync('lib/designs/global/resolve.ts', 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
const { resolveVariant, templateFromCanvas } = new Function(stripTypeScriptTypes(source, { mode: 'transform' }) + ';return { resolveVariant, templateFromCanvas }')()
const photo = { id: 'photo', type: 'image', src: '{{image.primary}}', x: 0, y: 0, width: 1080, height: 1350 }
const copy = { id: 'headline', type: 'text', text: '{{headline}}', x: 100, y: 200, width: 600, height: 100, fontSize: 40, fontFamily: 'brand.headingFont', color: 'brand.onImage' }
const family = { width: 1080, height: 1350, typography: { headingFallback: 'Inter', bodyFallback: 'Inter' } }
const render = nodes => resolveVariant(family, { id: 'cover', background: 'brand.background', nodes }, {}, { headline: 'Readable copy' }, 0, '/photo.png')

test('photographic copy gets a known contrast surface, without changing the template', () => {
  for (const color of ['brand.onImage', 'brand.textPrimary']) {
    const variant = { id: 'cover', background: 'brand.background', nodes: [photo, { ...copy, color }] }
    const before = JSON.stringify(variant)
    const canvas = render(variant.nodes)
    const backing = canvas.nodes.find(n => n.contrastBacking)
    assert.equal(backing.fill, color === 'brand.onImage' ? '#101010' : '#ffffff')
    assert.equal(canvas.nodes.findIndex(n => n.contrastBacking) + 1, canvas.nodes.findIndex(n => n.type === 'text'))
    assert.equal(JSON.stringify(variant), before)
    assert.equal(templateFromCanvas(family, variant, canvas).nodes.length, 2)
  }
})

test('existing opaque panels determine text contrast and avoid extra backing', () => {
  const canvas = render([photo, { id: 'panel', type: 'shape', shape: 'rect', x: 90, y: 190, width: 620, height: 120, fill: 'brand.background' }, copy])
  assert.equal(canvas.nodes.some(n => n.contrastBacking), false)
  assert.equal(canvas.nodes.find(n => n.type === 'text').color, '#101010')
})

test('copy outside the photo stays unchanged', () => {
  const canvas = render([{ ...photo, y: 500, height: 500 }, copy])
  assert.equal(canvas.nodes.some(n => n.contrastBacking), false)
})
