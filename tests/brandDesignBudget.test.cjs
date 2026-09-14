const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const load=p=>stripTypeScriptTypes(fs.readFileSync(p,'utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const brief=new Function(load('lib/designs/brandBlueprint.ts')+';return BLUEPRINT_BRIEF')()
const build=new Function('BLUEPRINT_BRIEF',load('lib/designs/brandDesignRequest.ts')+';return brandDesignRequest')(brief)
const batch=new Function(fs.readFileSync('lib/designs/generateBrandBatch.js','utf8').replace(/export /g,'')+';return generateBrandBatch')()
test('large brand data and repairs remain bounded without previous layout replay',()=>{
 const brand={name:'x'.repeat(10000),about:'x'.repeat(100000),values:'x'.repeat(10000),audience:'x'.repeat(10000),fonts:Array(50).fill('x'.repeat(1000)),colors:Array(100).fill('#123456')}
 for(const repair of [false,true]){
  const request=build(brand,Array(24).fill({name:'y'.repeat(1000),blueprint:{templates:{huge:'z'.repeat(50000)}}}),repair)
  assert.equal(request.max_tokens,3600)
  assert.ok(JSON.stringify(request.messages).length<8500)
  assert.ok(request.messages[0].content.includes('Author ONE'))
  assert.equal(JSON.stringify(request).includes('zzzzzz'),false)
 }
})
test('three requests save sequentially and temporary rate limit waits before retry',async()=>{
 const saved=[],progress=[],waits=[];let calls=0
 await batch({count:3,flowId:'f',brand:{designs:[]},onSaved:b=>saved.push(b),onProgress:p=>progress.push(p),wait:async ms=>waits.push(ms),request:async(url,options)=>{
  calls++;if(calls===2)return new Response(JSON.stringify({error:'limited'}),{status:429,headers:{'retry-after':'2'}})
  const brand=JSON.parse(options.body).brandContext
  return new Response(JSON.stringify({brandContext:{designs:[...brand.designs,{id:String(calls)}]}}))
 }})
 assert.equal(calls,4);assert.equal(saved.length,3);assert.equal(saved[2].designs.length,3);assert.deepEqual(waits,[61000,61000,61000]);assert.ok(progress.some(p=>p.includes('waiting')))
})
test('one click defaults to one request and one saved design with no inter-design delay',async()=>{
 let calls=0,saved=0
 await batch({flowId:'f',brand:{},onSaved:()=>saved++,onProgress:()=>{},wait:async()=>assert.fail('unexpected wait'),request:async()=>{calls++;return new Response(JSON.stringify({brandContext:{designs:[{id:'one'}]}}))}})
 assert.equal(calls,1);assert.equal(saved,1)
})
test('failure retains completed designs and does not retry permanent 413',async()=>{
 let calls=0,saved=0
 await assert.rejects(batch({count:3,flowId:'f',brand:{},onSaved:()=>saved++,onProgress:()=>{},wait:async()=>{},request:async()=>++calls===1?new Response(JSON.stringify({brandContext:{designs:[{id:'one'}]}})):new Response(JSON.stringify({error:'too large'}),{status:413})}),/already saved/)
 assert.equal(saved,1);assert.equal(calls,2)
})
