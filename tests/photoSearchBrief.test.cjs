const {test}=require('node:test')
const assert=require('node:assert/strict')
const {stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(require('node:fs').readFileSync('lib/handlers/assetPlannerHandler.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const engine=completion=>new Function('Groq','availableGroqCompletion','process','console',source+';return refinePhotoBriefs')(class {},completion,{env:{GROQ_API_KEY:'test'}},{warn:()=>{}})

test('photo search uses the exact multilingual slide body instead of a broad topic',async()=>{
 let calls=0
 const refine=engine(async(client,request)=>{
  calls++
  assert.equal(JSON.parse(request.messages[1].content).slides[0].copy.body,'Rega junto às raízes')
  return {choices:[{message:{content:JSON.stringify({slots:[{slot_id:'slide_1',subject_description:'Drip irrigation',search_queries:['vegetable roots drip irrigation'],search_keywords:['vegetable','drip','irrigation']}]})}}]}
 })
 const slots=[{slot_id:'slide_1',needs_visual:false,search_keywords:['wheat']}]
 await refine(slots,[{slot_id:'slide_1',needs_visual:true,treatment:'environmental'}],{slides:[{headline:'Poupar água',body:'Rega junto às raízes'}]},{topic:'Agricultura'})
 assert.equal(calls,1)
 assert.equal(slots[0].needs_visual,true)
 assert.deepEqual(slots[0].search_keywords,['vegetable','drip','irrigation'])
})

test('search model outage retains the local photo brief',async()=>{
 const refine=engine(async()=>{throw Error('offline')})
 const slots=[{slot_id:'slide_1',search_queries:['garden soil']}]
 await refine(slots,[{slot_id:'slide_1',needs_visual:true,treatment:'environmental'}],{headline:'Soil'},{})
 assert.deepEqual(slots,[{slot_id:'slide_1',search_queries:['garden soil']}])
})
