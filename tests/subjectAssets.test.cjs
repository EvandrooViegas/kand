const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const sharp = require('sharp')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/services/subjectAssets.ts'), 'utf8').replace(/^import .*$/gm, '').replace(/export /g, '')
const service = vm.runInNewContext(stripTypeScriptTypes(source) + '\n({validateSubject,createSubject,prepareSubjectAssets})', {
  require, sharp, Buffer, Blob, Uint8Array, URL, console,
  createHash: require('node:crypto').createHash, Binary: require('mongodb').Binary,
  downloadLogo: async () => { throw new Error('offline fixture') },
})
async function fixture(background = 'transparent') {
  return sharp(Buffer.from(`<svg width="100" height="120"><rect width="100" height="120" fill="${background}"/><rect x="30" y="20" width="40" height="80" fill="red"/></svg>`)).png().toBuffer()
}
test('valid alpha is retained and transparent margins trimmed', async () => {
  const result = await service.createSubject(await fixture())
  assert.equal(result.width, 48); assert.equal(result.height, 88)
  assert.equal((await sharp(result.png).metadata()).hasAlpha, true)
})
test('empty and opaque masks are rejected', async () => {
  assert.equal(await service.validateSubject(await fixture('white')), null)
  const empty = await sharp({ create: { width: 100, height: 100, channels: 4, background: '#00000000' } }).png().toBuffer()
  assert.equal(await service.validateSubject(empty), null)
})
test('derivative persists once and subsequent requests reuse it', async () => {
  const uploads = new Map(); let writes = 0
  const db = { collection: () => ({ findOne: async ({ id }) => uploads.get(id), updateOne: async ({ id }, update) => { writes++; uploads.set(id, update.$setOnInsert) } }) }
  const url = 'data:image/png;base64,' + (await fixture()).toString('base64')
  const plan = { slots: [{ slot_id: 'a', resolvedAsset: { url } }, { slot_id: 'b', resolvedAsset: { url } }] }
  const first = await service.prepareSubjectAssets(db, plan)
  const second = await service.prepareSubjectAssets(db, plan)
  assert.equal(writes, 1)
  assert.equal(first.slots[0].resolvedAsset.url, url)
  assert.equal(first.slots[0].resolvedAsset.subject.url, second.slots[0].resolvedAsset.subject.url)
  assert.equal(plan.slots[0].resolvedAsset.subject, undefined)
})
test('failed remote image leaves original usable', async () => {
  const plan = { slots: [{ slot_id: 'a', resolvedAsset: { url: 'https://example.com/photo.jpg' } }] }
  const result = await service.prepareSubjectAssets({}, plan)
  assert.equal(result.slots[0].resolvedAsset.url, plan.slots[0].resolvedAsset.url)
  assert.equal(result.slots[0].resolvedAsset.subject, undefined)
})
