const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { stripTypeScriptTypes } = require('node:module')
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../lib/services/logoVariants.ts'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
const { createLogoVariants } = require('node:vm').runInNewContext(stripTypeScriptTypes(source) + '\n({createLogoVariants})', { sharp, Buffer, Uint8Array, Int32Array })
const decode = src => sharp(Buffer.from(src.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer()

test('removes colored flat backgrounds and generates contrasting opaque and transparent variants', async () => {
  const input = await sharp(Buffer.from('<svg width="80" height="40"><rect width="80" height="40" fill="red"/><rect x="20" y="10" width="40" height="20" fill="blue"/></svg>')).png().toBuffer()
  const variants = await createLogoVariants(input)
  assert.equal(Object.keys(variants).length, 7)
  for (const key of ['originalTransparent', 'blackTransparent', 'whiteTransparent']) {
    const pixels = await decode(variants[key])
    assert.equal(pixels[3], 0)
    assert.equal(pixels[(15 * 80 + 25) * 4 + 3], 255)
  }
  assert.deepEqual([...((await decode(variants.blackTransparent)).subarray((15 * 80 + 25) * 4, (15 * 80 + 25) * 4 + 4))], [0, 0, 0, 255])
  assert.deepEqual([...(await decode(variants.whiteOnBlack)).subarray(0, 4)], [0, 0, 0, 255])
  assert.deepEqual([...(await decode(variants.blackOnWhite)).subarray(0, 4)], [255, 255, 255, 255])
})

test('preserves partial alpha and aspect ratio of transparent artwork', async () => {
  const input = await sharp({ create: { width: 20, height: 10, channels: 4, background: { r: 30, g: 50, b: 200, alpha: .5 } } }).png().toBuffer()
  const variants = await createLogoVariants(input)
  const raw = await decode(variants.whiteTransparent)
  assert.equal(raw.length, 20 * 10 * 4)
  assert.ok(raw[3] >= 127 && raw[3] <= 128)
  assert.equal(raw[0], 255)
})

test('rejects empty artwork and invalid images', async () => {
  await assert.rejects(createLogoVariants(Buffer.from('invalid')))
  const blank = await sharp({ create: { width: 20, height: 20, channels: 4, background: 'white' } }).png().toBuffer()
  await assert.rejects(createLogoVariants(blank), /No visible logo/)
})

test('designer selects contrasting saved variants without downloading the original', async () => {
  const code = require('node:fs').readFileSync(require('node:path').join(__dirname, '../lib/handlers/canvasDesignerHandler.ts'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
  const { softenCanvasLogos } = require('node:vm').runInNewContext(stripTypeScriptTypes(code) + '\n({softenCanvasLogos})', {
    containPreparedLogo: async logo => logo.src,
    prepareLogo: async () => { throw new Error('Unexpected download') },
  })
  for (const [background, expected] of [['#ffffff', 'black'], ['#000000', 'white']]) {
    const canvas = { background, nodes: [{ type: 'image', src: 'https://example.com/logo.png', x: 0, y: 0, width: 100, height: 40 }] }
    await softenCanvasLogos(canvas, 'https://example.com/logo.png', { source: 'https://example.com/logo.png', blackTransparent: 'black', whiteTransparent: 'white' })
    assert.equal(canvas.nodes.length, 1)
    assert.equal(canvas.nodes[0].src, expected)
    assert.equal(canvas.nodes[0].width, 100)
  }
})
