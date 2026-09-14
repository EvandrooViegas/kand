const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const resolve=new Function(stripTypeScriptTypes(fs.readFileSync('lib/designs/canvasBrand.ts','utf8').replace('export async function','async function'))+';return canvasBrand')()
test('latest saved designs retain the owning flow ID when brand context omits it',async()=>{
 const db={collection:()=>({findOne:async q=>{assert.deepEqual(q,{id:'flow'});return {id:'flow',brandContext:{name:'Brand',designs:[{id:'new'}]}}}})}
 assert.deepEqual(await resolve(db,{designInput:{brandContext:{id:'flow',designs:[]}}}),{id:'flow',name:'Brand',designs:[{id:'new'}]})
})
test('legacy canvas uses its creation history rather than matching brand names',async()=>{
 const db={collection:()=>({findOne:async q=>{assert.equal(q.$expr.$anyElementTrue.$map.in.$eq[1],'canvas');return {id:'owner',brandContext:{name:'Brand',designs:[{id:'saved'}]}}}})}
 const brand=await resolve(db,{id:'canvas',designInput:{brandContext:{name:'Brand'}}})
 assert.equal(brand.id,'owner');assert.equal(brand.designs[0].id,'saved')
})
test('unlinked manual canvas retains its original context',async()=>{
 const original={name:'Manual',colors:['#123456']}
 assert.deepEqual(await resolve({collection:()=>({findOne:async()=>null})},{id:'manual',brandContext:original}),original)
})
