const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const load=p=>stripTypeScriptTypes(fs.readFileSync(p,'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const {DESIGN_LIBRARY}=new Function(load('lib/designs/library.ts')+';return {DESIGN_LIBRARY}')()
const helpers=new Function('DESIGN_LIBRARY',load('lib/designs/minimumBrandDesigns.ts')+';return {withMinimumBrandDesigns,ensureMinimumBrandDesigns}')(DESIGN_LIBRARY)
test('new brands receive three distinct designs and existing designs are preserved',()=>{
 for(const imageDisposition of ['cutout','background','framed','none']){
  const brand={name:'Example',imageDisposition,colors:['#123456'],fonts:['Oswald']}
  const result=helpers.withMinimumBrandDesigns(brand)
  assert.equal(result.designs.length,3);assert.equal(new Set(result.designs.map(d=>d.baseId)).size,3)
  assert.equal(result.colors,brand.colors);assert.equal(result.fonts,brand.fonts)
  assert.deepEqual(helpers.withMinimumBrandDesigns(result),result)
 }
 const existing={id:'custom',baseId:'editorial',blueprint:{identity:'Keep this'}}
 const result=helpers.withMinimumBrandDesigns({designs:[existing]})
 assert.equal(result.designs[0],existing);assert.equal(result.designs.length,3)
 const full={designs:Array.from({length:5},(_,i)=>({id:String(i)}))}
 assert.deepEqual(helpers.withMinimumBrandDesigns(full),full)
})
test('concurrent backfills add only missing designs and remain idempotent',async()=>{
 let flow={id:'brand',brandContext:{name:'Brand',designs:[{id:'custom',baseId:'editorial'}]}},writes=0
 const db={collection:()=>({findOne:async()=>structuredClone(flow),updateOne:async(query,update)=>{
  if(JSON.stringify(query['brandContext.designs'])!==JSON.stringify(flow.brandContext.designs))return {matchedCount:0}
  flow.brandContext.designs=update.$set['brandContext.designs'];writes++;return {matchedCount:1}
 }})}
 const initial=structuredClone(flow)
 const results=await Promise.all([helpers.ensureMinimumBrandDesigns(db,initial),helpers.ensureMinimumBrandDesigns(db,initial)])
 assert.ok(results.every(f=>f.brandContext.designs.length===3));assert.equal(writes,1)
 await helpers.ensureMinimumBrandDesigns(db,flow);assert.equal(writes,1)
 assert.equal(flow.brandContext.designs[0].id,'custom')
})
