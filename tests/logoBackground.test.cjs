const { test } = require('node:test')
const assert = require('node:assert/strict')
const sharp = require('sharp')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/services/logoBackground.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '')
const service = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({removeFlatLogoBackground,containPreparedLogo,prepareLogo})', { sharp, Buffer, Uint8Array, Int32Array, URL, AbortSignal, isIP: require('node:net').isIP, lookup: async () => [{ address: '127.0.0.1' }] })
async function logo(background = 'white') {
  return sharp(Buffer.from(`<svg width="100" height="100"><rect width="100" height="100" fill="${background}"/><rect x="25" y="20" width="50" height="60" fill="black"/><rect x="40" y="40" width="20" height="20" fill="white"/></svg>`)).png().toBuffer()
}
test('removes edge-connected white while preserving enclosed white details', async () => {
  const result = await service.removeFlatLogoBackground(await logo())
  assert.ok(result?.removed)
  const { data } = await sharp(Buffer.from(result.src.split(',')[1], 'base64')).raw().toBuffer({ resolveWithObject: true })
  assert.equal(data[3], 0)
  assert.equal(data[(50 * 100 + 50) * 4 + 3], 255)
  assert.equal(data[(30 * 100 + 30) * 4 + 3], 255)
})
test('keeps transparent and colored backgrounds unchanged', async () => {
  assert.equal(await service.removeFlatLogoBackground(await logo('transparent')), null)
  assert.equal(await service.removeFlatLogoBackground(await logo('red')), null)
})
test('contains logo in its canvas box without cropping', async () => {
  const prepared = await service.removeFlatLogoBackground(await logo())
  const src = await service.containPreparedLogo(prepared, 140, 70)
  const meta = await sharp(Buffer.from(src.split(',')[1], 'base64')).metadata()
  assert.equal(meta.width, 140); assert.equal(meta.height, 70)
})
test('invalid images and non-public downloads fail safely', async () => {
  assert.equal(await service.prepareLogo('http://127.0.0.1/logo.png'), null)
  await assert.rejects(service.removeFlatLogoBackground(Buffer.from('not an image')))
})

test('dual-stack public image hosts are accepted; private IPv6 stays blocked', async () => {
  const check = addresses => vm.runInNewContext(stripTypeScriptTypes(source) + '\n({publicUrl})', {
    URL, isIP: require('node:net').isIP, lookup: async () => addresses.map(address => ({ address })),
  }).publicUrl('https://images.example/photo')
  await check(['146.75.90.208', '2a04:4e42:86::720'])
  for (const address of ['::1', 'fc00::1', 'fe80::1', '::ffff:127.0.0.1', '2001:db8::1']) await assert.rejects(check([address]), /Non-public/)
})
