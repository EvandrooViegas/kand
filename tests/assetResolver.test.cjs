const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
const { stripTypeScriptTypes } = require('node:module')
const source = fs.readFileSync(require('node:path').join(__dirname, '../lib/handlers/assetResolverHandler.ts'), 'utf8')
  .replace(/^import .*$/gm, '').replace(/export /g, '')
function engine(fetch, generation, env = {}) {
  const library=new Function('createHash',stripTypeScriptTypes(fs.readFileSync('lib/services/generatedAssetLibrary.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))+';return {findGeneratedAsset,saveGeneratedAsset}')(require('node:crypto').createHash)
  return vm.runInNewContext(stripTypeScriptTypes(source) + (generation ? '\ngenerateImage = generation;\n' : '') + '\n({ searchUnsplash, resolveSlot, buildGenerationBrief, generateImageOpenAI })', {
    ...library,fetch, generation, console, Buffer, Uint8Array, AbortSignal, sharp: require('sharp'), process: {env}, Math: Object.assign(Object.create(Math), { random: () => 0 }),
  })
}
const photo = id => ({ id, urls: { regular: `https://images.example/${id}` } })
const slot = { search_queries: ['hands testing soil', 'gardener holding soil'], search_keywords: ['garden'], visual_purpose: 'Check soil' }
test('background stock preference avoids AI and retains environmental treatment',async()=>{
 const e=engine(async()=>({ok:true,json:async()=>({results:[photo('background')]})}),async()=>{throw Error('AI should not run')})
 const result=await e.resolveSlot({}, {...slot,slot_id:'bg',needs_visual:true,preferred_source:'unsplash',treatment:'environmental'},null,'key',null,new Set())
 assert.equal(result.source,'unsplash');assert.equal(result.treatment,'environmental')
})

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

test('AI failure does not retry or switch to stock',async()=>{
 const order=[]
 const e=engine(async()=>{order.push('stock');return {ok:true,json:async()=>({results:[photo('fallback')]})}},async()=>{order.push('ai');throw Error('Provider unavailable')})
 const result=await e.resolveSlot(null,{...slot,needs_visual:true,preferred_source:'ai_generated'},null,'key',null,new Set())
 assert.deepEqual(order,['ai'])
 assert.equal(result.source,'ai_generated')
 assert.equal(result.resolvedAsset,null)
 assert.match(result.warning,/Provider unavailable/)
})
test('failed stock selection does not automatically generate an AI image',async()=>{
 const e=engine(async()=>{throw Error('Stock must not run')},async()=>({source:'ai_generated',url:'data:image/png;base64,fixture'}))
 const result=await e.resolveSlot(null,{...slot,needs_visual:true,preferred_source:'unsplash'},null,'key',null,new Set())
 assert.equal(result.source,'unsplash')
 assert.equal(result.resolvedAsset,null)
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

async function alphaFramingFixture(twoSides){
 const sharp=require('sharp')
 const png=await sharp(Buffer.from(`<svg width="100" height="100"><rect x="0" y="10" width="${twoSides?100:60}" height="80" fill="red"/></svg>`)).png().toBuffer()
 return {url:'data:image/png;base64,'+png.toString('base64'),width:100,height:100}
}

test('single generation receives strict constraints without automatic crop retries',async()=>{
 const bad=await alphaFramingFixture(true),good=await alphaFramingFixture(false),prompts=[]
 const e=engine(async()=>{throw Error('Stock should not run')},async prompt=>{prompts.push(prompt);return prompts.length===1?bad:good})
 const result=await e.resolveSlot({}, {...slot,slot_id:'a',needs_visual:true,preferred_source:'ai_generated',treatment:'isolated_subject'},null,null,null,new Set())
 assert.equal(prompts.length,1);assert.match(prompts[0],/STRICT COMPOSITION CONSTRAINTS/)
 assert.match(prompts[0],/NO horizontal cropping/)
 assert.equal(result.resolvedAsset.url,bad.url);assert.equal(result.source,'ai_generated')
})

test('crop output never triggers a second generation or stock fallback',async()=>{
 const bad=await alphaFramingFixture(true);let generations=0
 const e=engine(async()=>({ok:true,json:async()=>({results:[photo('safe-stock')]})}),async()=>{generations++;return bad})
 const result=await e.resolveSlot({}, {...slot,slot_id:'a',needs_visual:true,preferred_source:'ai_generated',treatment:'isolated_subject'},null,'stock-key',null,new Set())
 assert.equal(generations,1);assert.equal(result.source,'ai_generated')
 assert.equal(result.warning,null)
 assert.equal(result.resolvedAsset.url,bad.url)
})

test('brand library match bypasses generation, while a different activity generates once',async()=>{
 const request={...slot,needs_visual:true,slot_id:'a',preferred_source:'ai_generated',treatment:'isolated_subject',image_style:'photograph',subject_description:'warehouse operator scanning parcel barcode with handheld scanner'}
 const saved={id:'saved',brand_id:'brand-a',status:'ready',source:'ai_generated',url:'/api/uploads/saved',width:100,height:100,subject_description:request.subject_description,treatment:request.treatment,image_style:'photograph'}
 let calls=0
 const db={collection:()=>({find:query=>({toArray:async()=>query.brand_id==='brand-a'?[saved]:[]}),updateOne:async()=>{}})}
 const e=engine(async()=>{throw Error('No stock')},async()=>{calls++;return {url:'new-image'}})
 const reused=await e.resolveSlot(db,request,'brand-a',null,null,new Set())
 assert.equal(calls,0);assert.equal(reused.resolvedAsset.url,saved.url);assert.equal(reused.resolvedAsset.reused,true)
 const fresh=await e.resolveSlot(db,{...request,subject_description:'customer paying at a contactless payment terminal'},'brand-a',null,null,new Set())
 assert.equal(calls,1);assert.equal(fresh.resolvedAsset.url,'new-image')
})

test('object-only scene overrides brand requests for people without generating images',()=>{
 const brief=engine(async()=>{throw Error('No generation expected')}).buildGenerationBrief({...slot,treatment:'isolated_subject',subject_description:'Object-only: a hammer and rolled blueprint, no people',generation_prompt:'Brand usually shows a worker at a desk'},true)
 assert.match(brief,/MANDATORY OBJECT-ONLY COMPOSITION/)
 assert.match(brief,/Zero people, faces, hands, workers/)
 assert.match(brief,/neither|both left and right/i)
 assert.ok(!brief.includes('Use a compact freestanding desk'))
})
