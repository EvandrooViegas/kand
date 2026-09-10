const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const { stripTypeScriptTypes } = require('node:module')
const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../lib/services/logoVariants.ts'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
const { createLogoVariants, generateLogoVariants } = require('node:vm').runInNewContext(stripTypeScriptTypes(source) + '\n({createLogoVariants,generateLogoVariants})', { sharp, Buffer, Uint8Array, Int32Array })
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

test('URL-encoded SVG data logos produce variants',async()=>{
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect x="20" y="20" width="40" height="40" fill="red"/></svg>'
 const result=await generateLogoVariants('data:image/svg+xml,'+encodeURIComponent(svg))
 assert.ok(result.whiteTransparent.startsWith('data:image/png;base64,'))
})
test('PNG inside ICO is decoded automatically',async()=>{
 const png=await sharp(Buffer.from('<svg width="32" height="32"><rect x="8" y="8" width="16" height="16" fill="red"/></svg>')).png().toBuffer()
 const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=32;header[7]=32;header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18)
 const result=await createLogoVariants(Buffer.concat([header,png]))
 assert.ok(result.blackTransparent)
})

test('badge variants retain the lettering instead of a solid circle',async()=>{
 const input=await sharp(Buffer.from('<svg width="100" height="100"><circle cx="50" cy="50" r="48" fill="black"/><path d="M35 70 V30 L65 70 V30" fill="none" stroke="white" stroke-width="7"/></svg>')).png().toBuffer()
 const result=await createLogoVariants(input)
 const black=await decode(result.blackTransparent),white=await decode(result.whiteTransparent),original=await decode(result.originalTransparent)
 const badge=(50*100+15)*4,ink=(40*100+35)*4
 assert.equal(original[badge+3],255)
 assert.equal(black[badge+3],0)
 assert.equal(white[badge+3],0)
 assert.ok(black[ink+3]>220)
 assert.equal(black[ink],0)
 assert.equal(white[ink],255)
})
