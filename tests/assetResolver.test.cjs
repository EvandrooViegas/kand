const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/assetResolverHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '')
function engine(fetch, generation, env = {}) {
  return vm.runInNewContext(stripTypeScriptTypes(source) + (generation ? '\ngenerateImage = generation;\n' : '') + '\n({ searchUnsplash, resolveSlot, buildGenerationBrief, generateImageOpenAI })', {
    fetch, generation, console, Buffer, Uint8Array, AbortSignal, sharp: require('sharp'), process: {env}, Math: Object.assign(Object.create(Math), { random: () => 0 }),
  })
}
const photo = id => ({ id, urls: { regular: `https://images.example/${id}` } })
const slot = { search_queries: ['hands testing soil', 'gardener holding soil'], search_keywords: ['garden'], visual_purpose: 'Check soil' }

test('concurrent slots reserve distinct photos from overlapping results', async () => {
  const e = engine(async () => ({ ok: true, json: async () => ({ results: [photo('a'), photo('b')] }) }))
  const used = new Set()
  const results = await Promise.all([e.searchUnsplash(slot, 'key', used), e.searchUnsplash(slot, 'key', used)])
  assert.equal(new Set(results.map(r => r.unsplash_id)).size, 2)
})

test('exhausted results retry a standalone alternative query', async () => {
  const queries = []
  const e = engine(async url => {
    queries.push(new URL(url).searchParams.get('query'))
    return { ok: true, json: async () => ({ results: queries.length === 1 ? [photo('used')] : [photo('new')] }) }
  })
  assert.equal((await e.searchUnsplash(slot, 'key', new Set(['used']))).unsplash_id, 'new')
  assert.deepEqual(queries, slot.search_queries)
})

test('legacy tags work and empty searches do not request arbitrary photos', async () => {
  const queries = []
  const e = engine(async url => {
    queries.push(new URL(url).searchParams.get('query'))
    return { ok: true, json: async () => ({ results: [photo('legacy')] }) }
  })
  await e.searchUnsplash({ search_keywords: ['garden', 'soil'] }, 'key', new Set())
  assert.deepEqual(queries, ['garden soil'])
  assert.equal(await e.searchUnsplash({ search_keywords: [] }, 'key', new Set()), null)
  assert.equal(queries.length, 1)
})

test('text-only slides never fetch an image', async () => {
  const e = engine(async () => { throw new Error('Unexpected request') })
  const result = await e.resolveSlot(null, { ...slot, needs_visual: false, preferred_source: 'none' }, null, 'key', null, new Set())
  assert.equal(result.resolvedAsset, null)
})

test('isolated subject ranking prefers a relevant portrait over crowds', async () => {
  const e = engine(async () => ({ ok: true, json: async () => ({ results: [
    { ...photo('crowd'), alt_description: 'group of people in a crowd' },
    { ...photo('portrait'), alt_description: 'single person studio portrait' },
  ] }) }))
  const result = await e.searchUnsplash({ ...slot, treatment: 'isolated_subject', search_keywords: ['person'] }, 'key', new Set())
  assert.equal(result.unsplash_id, 'portrait')
})

test('generation brief includes exact slide context and explicit realism and cutout instructions',()=>{
 const brief=engine().buildGenerationBrief({...slot,treatment:'isolated_subject',slide_context:{headline:'Work efficiently',body:'Type and manage orders on your laptop'},subject_description:'Shop owner typing on a laptop',brand_context:{name:'Example'}})
 assert.ok(brief.includes('Type and manage orders on your laptop'))
 assert.ok(brief.includes('Shop owner typing on a laptop'))
 assert.ok(brief.includes('Photorealistic'))
 assert.ok(brief.includes('background-removal code'))
 const scene=engine().buildGenerationBrief({...slot,treatment:'environmental'})
 assert.ok(scene.includes('Preserve meaningful workspace'))
 assert.ok(!scene.includes('Plain contrasting studio backdrop'))
})

test('AI failure falls back to Unsplash and reports the actual source',async()=>{
 const order=[]
 const e=engine(async()=>{order.push('stock');return {ok:true,json:async()=>({results:[photo('fallback')]})}},async()=>{order.push('ai');throw Error('Provider unavailable')})
 const result=await e.resolveSlot(null,{...slot,needs_visual:true,preferred_source:'ai_generated'},null,'key',null,new Set())
 assert.deepEqual(order,['ai','stock'])
 assert.equal(result.source,'unsplash')
 assert.match(result.warning,/Provider unavailable/)
})
test('successful AI skips stock even for older Unsplash plans',async()=>{
 const e=engine(async()=>{throw Error('Stock must not run')},async()=>({source:'ai_generated',url:'data:image/png;base64,fixture'}))
 const result=await e.resolveSlot(null,{...slot,needs_visual:true,preferred_source:'unsplash'},null,'key',null,new Set())
 assert.equal(result.source,'ai_generated')
})

test('GPT Image 2.5 requests native transparent PNG and reads real dimensions', async () => {
  const png=await require('sharp')({create:{width:64,height:80,channels:4,background:'#00000000'}}).png().toBuffer()
  let request
  const e=engine(async (url,options)=>{request=JSON.parse(options.body);assert.equal(url,'https://api.openai.com/v1/images/generations');return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}))},null,{OPENAI_API_KEY:'test-only'})
  const image=await e.generateImageOpenAI('person holding complete laptop',true)
  assert.equal(request.model,'gpt-image-2.5-sunburst')
  assert.equal(request.background,'transparent')
  assert.equal(request.output_format,'png')
  assert.equal(image.width,64);assert.equal(image.height,80)
})
test('missing OpenAI key reports configuration error without fetching',async()=>{
 const e=engine(()=>{throw Error('must not fetch')})
 await assert.rejects(e.generateImageOpenAI('photo',false),/OPENAI_API_KEY/)
})

test('drawing design requests illustration instead of photorealistic output',()=>{
 const brief=engine(()=>{}).buildGenerationBrief({...slot,image_style:'drawing',treatment:'isolated_subject'},true)
 assert.ok(brief.includes('editorial illustration'))
 assert.ok(brief.includes('Intentional editorial drawing'))
 assert.equal(brief.includes('Photorealistic natural skin'),false)
})
