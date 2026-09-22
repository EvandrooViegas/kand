const {test}=require('node:test')
const assert=require('node:assert/strict')
const {stripTypeScriptTypes}=require('node:module')
const source=require('node:fs').readFileSync('lib/services/ai/availableGroqCompletion.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,'')
const run=new Function('budgetedModels','budgetedCompletion','process',stripTypeScriptTypes(source)+';return availableGroqCompletion')(groq=>groq.models.list(),(groq,request)=>groq.chat.completions.create(request),{env:{}})
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

test('ignores audio and inactive models regardless of catalog order',async()=>{
 const calls=[]
 const data=[{id:'whisper-large-v3'},{id:'canopylabs/orpheus-v1-english'},{id:'canopylabs/orpheus-arabic-saudi'},{id:'openai/gpt-oss-120b',active:false},{id:'llama-3.3-70b-versatile'}]
 const groq={models:{list:async()=>({data})},chat:{completions:{create:async r=>{calls.push(r.model);return 'ok'}}}}
 assert.equal(await run(groq,{}),'ok')
 assert.deepEqual(calls,['llama-3.3-70b-versatile'])
 data.pop()
 await assert.rejects(run(groq,{},'GROQ_CONTENT_IDEAS_MODEL'),/Configure GROQ_CONTENT_IDEAS_MODEL/)
 assert.equal(calls.length,1)
})

for(const error of [
 {status:400,error:{error:{code:'model_terms_required'}}},
 {status:403,error:{code:'model_permission_blocked'}},
 {status:400,error:{error:{message:'The model does not support chat completions'}}},
]) test('falls back within the same request for '+JSON.stringify(error),async()=>{
 const calls=[]
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async r=>{calls.push(r);if(calls.length===1)throw error;return 'ok'}}}}
 assert.equal(await run(groq,{messages:[{role:'user',content:'Generate an idea'}],max_tokens:1800}),'ok')
 assert.deepEqual(calls.map(r=>r.model),['openai/gpt-oss-120b','openai/gpt-oss-20b'])
 assert.deepEqual(calls[0].messages,calls[1].messages)
 assert.equal(calls[1].max_tokens,1800)
})

for(const status of [400,401,429,500]) test('does not hide unrelated '+status+' errors',async()=>{
 let calls=0
 const error={status,message:'Request failed'}
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-120b'},{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async()=>{calls++;throw error}}}}
 await assert.rejects(run(groq,{}),e=>e===error)
 assert.equal(calls,1)
})

test('reports exhausted eligible models without retrying indefinitely',async()=>{
 let calls=0
 const groq={models:{list:async()=>({data:[{id:'openai/gpt-oss-20b'}]})},chat:{completions:{create:async()=>{calls++;throw {status:400,code:'model_terms_required'}}}}}
 await assert.rejects(run(groq,{}),/could not use any of the supported chat models/)
 assert.equal(calls,1)
})
