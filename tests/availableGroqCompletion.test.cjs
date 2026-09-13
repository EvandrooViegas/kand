const {test}=require('node:test')
const assert=require('node:assert/strict')
const {stripTypeScriptTypes}=require('node:module')
const source=require('node:fs').readFileSync('lib/services/ai/availableGroqCompletion.ts','utf8').replace(/export /g,'')
const run=new Function('process',stripTypeScriptTypes(source)+';return availableGroqCompletion')({env:{}})
test('uses available chat model instead of unavailable hardcoded model',async()=>{
 let chosen
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async r=>{chosen=r;return 'ok'}}}}
 assert.equal(await run(groq,{messages:[],response_format:{type:'json_object'}}),'ok')
 assert.equal(chosen.model,'openai/gpt-oss-20b')
 assert.equal(chosen.response_format.type,'json_object')
})
test('tries next catalog model after model access 404',async()=>{
 const calls=[]
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async r=>{calls.push(r.model);if(calls.length===1)throw {status:404};return 'ok'}}}}
 assert.equal(await run(groq,{}),'ok');assert.equal(calls.length,2)
})
test('does not retry authentication or rate limit errors against other models',async()=>{
 let count=0
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async()=>{count++;throw {status:429}}}}}
 await assert.rejects(run(groq,{}),e=>e.status===429);assert.equal(count,1)
})
