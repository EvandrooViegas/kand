const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(fs.readFileSync('lib/services/ai/designProvider.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const load=(env={})=>new Function('process','isTransientProviderError','retryProviderOperation',source+';return withDesignProviderFallback')({env},e=>[429,500,502,503,504].includes(e.status),fn=>fn())
const request={messages:[{role:'user',content:[{type:'text',text:'Return JSON'},{type:'image_url',image_url:{url:'data:image/png;base64,abc'}}]}],max_tokens:100,response_format:{type:'json_object'}}
test('Groq outage falls back to OpenAI with intact image and JSON request',async()=>{
 let sent
 const run=load({OPENAI_API_KEY:'private-test-key'})
 const response=await run(async()=>{throw {status:503}},request,{fetch:async(url,init)=>{sent={url,init};return {ok:true,json:async()=>({choices:[{message:{content:'{"ok":true}'}}]})}}})
 assert.equal(sent.url,'https://api.openai.com/v1/chat/completions')
 const body=JSON.parse(sent.init.body)
 assert.equal(body.model,'gpt-4.1-mini');assert.deepEqual(body.messages,request.messages);assert.equal(body.max_completion_tokens,100)
 assert.equal(response.choices[0].message.content,'{"ok":true}')
})
test('healthy Groq and invalid input do not call fallback',async()=>{
 const run=load({OPENAI_API_KEY:'test'}),options={fetch:()=>assert.fail('unexpected fallback')}
 assert.equal(await run(async()=> 'ok',request,options),'ok')
 await assert.rejects(run(async()=>{throw {status:400}},request,options),e=>e.status===400)
})
test('missing fallback credentials preserve original failure',async()=>{
 const error={status:503}
 await assert.rejects(load()(async()=>{throw error},request),e=>e===error)
})
test('fallback errors do not expose provider response bodies or credentials',async()=>{
 await assert.rejects(load({OPENAI_API_KEY:'secret'})(async()=>{throw {status:503}},request,{fetch:async()=>({ok:false,status:401,json:async()=>({error:{message:'secret provider detail',code:'invalid_api_key'}})})}),e=>e.status===401&&!e.message.includes('secret'))
})
test('exact Groq 413 TPM failure routes to the independent provider',async()=>{
 const error=Object.assign(Error('Request too large: Limit 8000, Requested 8765'),{status:413,error:{error:{code:'rate_limit_exceeded',type:'tokens'}}})
 let fallbackCalls=0
 const result=await load({OPENAI_API_KEY:'test'})(async()=>{throw error},request,{fetch:async()=>{fallbackCalls++;return {ok:true,json:async()=>({choices:[{message:{content:'{"ok":true}'}}]})}}})
 assert.equal(fallbackCalls,1);assert.equal(result.choices[0].message.content,'{"ok":true}')
})
test('oversized drafting requests bypass Groq before hitting its account limit',async()=>{
 await load({OPENAI_API_KEY:'test'})(async()=>assert.fail('oversized primary request sent'),{...request,max_tokens:8500},{fetch:async()=>({ok:true,json:async()=>({choices:[{message:{content:'{}'}}]})})})
})