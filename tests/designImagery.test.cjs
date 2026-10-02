const { test } = require('node:test')
const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const { stripTypeScriptTypes } = require('node:module')
const source = readFileSync('lib/designs/global/imagery.ts', 'utf8').replace(/export /g, '')
const { getDesignType, normalizeImagery } = new Function(stripTypeScriptTypes(source, { mode: 'transform' }) + ';return { getDesignType, normalizeImagery }')()
const family = nodes => ({ width: 1080, height: 1350, variants: [{ nodes }, { nodes: [] }] })
test('background photos remain background families with text-only slides', () => {
  assert.equal(getDesignType(family([{ type: 'image', src: '{{image.primary}}', width: 1080, height: 1350 }])), 'background')
})
test('logos and decorations do not count as content images', () => {
  assert.equal(getDesignType(family([{ type: 'image', src: '{{brand.logo}}' }, { type: 'shape' }])), 'none')
})
test('isolated objects and people count as cutouts, regardless of frame size', () => {
  assert.equal(getDesignType(family([{ type: 'image', src: '{{image.primary}}', imageType: 'cutout', width: 1080, height: 1350 }])), 'cutout')
  assert.equal(getDesignType({ ...family([]), designType: 'cutout' }), 'cutout')
})
test('legacy framed imagery maps to background photography', () => {
  assert.equal(normalizeImagery('framed'), 'background')
})
