const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(fs.readFileSync('lib/services/ai/requestBudget.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const create=(env={})=>new Function('globalThis','process',source+';return {groqKeys,retrySeconds,budgetedCompletion,resilientCompletion,resilientModels,compactBrand}')({},{env})
test('daily quota message uses the provider wait, not a fixed 15 seconds',()=>{
 const e=create();assert.equal(e.retrySeconds({message:'Please try again in 5m24.864s.'}),325)
 assert.equal(e.retrySeconds({headers:{'retry-after':'420'}}),420)
 assert.equal(e.compactBrand({name:'Brand',designs:[{huge:'x'.repeat(10000)}],logoVariants:{}}).designs,undefined)
})
test('discovers numbered and listed credentials without duplicates',()=>{
 const e=create({GROQ_API_KEY:'one',GROQ_API_KEY_2:'two',GROQ_API_KEY_3:'three',GROQ_API_KEYS:'three, four;five'})
 assert.deepEqual(e.groqKeys(),['one','two','three','four','five'])
})
test('long jobs survive repeated short all-key cooldowns',async()=>{
 const e=create(),delays=[],responses=[Object.assign(Error('cooling'),{status:429,headers:{'retry-after':'2'}}),Object.assign(Error('cooling'),{status:429,headers:{'retry-after':'1'}}),{ok:true}]
 const result=await e.resilientCompletion({}, {}, {maxWaitMs:10000,sleep:async ms=>delays.push(ms),complete:async()=>{const value=responses.shift();if(value instanceof Error)throw value;return value}})
 assert.deepEqual(result,{ok:true});assert.deepEqual(delays,[3000,2000])
})
test('model catalog requests wait through a short shared cooldown',async()=>{
 const e=create(),delays=[],responses=[Object.assign(Error('cooling'),{status:429,headers:{'retry-after':'1'}}),{data:[]}]
 const result=await e.resilientModels({}, {maxWaitMs:5000,sleep:async ms=>delays.push(ms),complete:async()=>{const value=responses.shift();if(value instanceof Error)throw value;return value}})
 assert.deepEqual(result,{data:[]});assert.deepEqual(delays,[2000])
})
test('simultaneous requests are serialized and a quota failure suppresses subsequent API calls',async()=>{
 const e=create();let active=0,peak=0,calls=0
 const groq={chat:{completions:{create:async()=>{calls++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;return 'ok'}}}}
 await Promise.all([e.budgetedCompletion(groq,{}),e.budgetedCompletion(groq,{})]);assert.equal(peak,1)
 groq.chat.completions.create=async()=>{calls++;throw {status:429,message:'Please try again in 5m24.864s.'}}
 await assert.rejects(e.budgetedCompletion(groq,{}))
 await assert.rejects(e.budgetedCompletion(groq,{}),err=>err.status===429)
 assert.equal(calls,3)
})
test('429 switches immediately to backup and subsequent requests stay on the available key',async()=>{
 const e=create(),calls=[]
 const primary={apiKey:'primary',chat:{completions:{create:async()=>{calls.push('primary');throw {status:429,message:'Please try again in 5m.'}}}}}
 const backup={apiKey:'backup',chat:{completions:{create:async()=>{calls.push('backup');return {ok:true}}}}}
 assert.deepEqual(await e.budgetedCompletion(primary,{},[backup]),{ok:true})
 await e.budgetedCompletion(primary,{},[backup])
 assert.deepEqual(calls,['primary','backup','backup'])
})
test('both keys exhausted return earliest retry without exposing credentials or retrying them',async()=>{
 const e=create();let calls=0
 const client=(apiKey,seconds)=>({apiKey,chat:{completions:{create:async()=>{calls++;throw {status:429,headers:{'retry-after':String(seconds)}}}}}})
 const a=client('private-a',300),b=client('private-b',120)
 await assert.rejects(e.budgetedCompletion(a,{},[b]),err=>err.status===429&&Number(err.headers['retry-after'])===120&&!err.message.includes('private'))
 await assert.rejects(e.budgetedCompletion(a,{},[b]))
 assert.equal(calls,2)
})
test('malformed requests do not rotate credentials',async()=>{
 const e=create();let backupCalls=0
 const a={chat:{completions:{create:async()=>{throw {status:400}}}}}
 const b={chat:{completions:{create:async()=>{backupCalls++}}}}
 await assert.rejects(e.budgetedCompletion(a,{},[b]),err=>err.status===400)
 assert.equal(backupCalls,0)
})

test('503 over-capacity recovers with exponential backoff',async()=>{
 const e=create(),delays=[];let calls=0
 const value=await e.resilientCompletion({}, {model:'qwen/qwen3.8-27b'}, {maxWaitMs:30000,random:()=>0,sleep:async ms=>delays.push(ms),complete:async()=>{calls++;if(calls<4)throw Object.assign(Error('qwen/qwen3.8-27b is currently over capacity'),{status:503});return {ok:true}}})
 assert.deepEqual(value,{ok:true});assert.equal(calls,4);assert.deepEqual(delays,[1000,2000,4000])
})
test('persistent capacity failure stops at the retry limit',async()=>{
 const e=create(),delays=[];let calls=0
 const error=Object.assign(Error('over capacity'),{status:503})
 await assert.rejects(e.resilientCompletion({}, {}, {maxWaitMs:30000,maxRetries:3,random:()=>0,sleep:async ms=>delays.push(ms),complete:async()=>{calls++;throw error}}),err=>err===error)
 assert.equal(calls,4);assert.deepEqual(delays,[1000,2000,4000])
})
test('capacity Retry-After is honored and cannot exceed the wait budget',async()=>{
 const e=create(),delays=[];let calls=0
 const error=Object.assign(Error('over capacity'),{status:503,headers:{'retry-after':'20'}})
 await assert.rejects(e.resilientCompletion({}, {}, {maxWaitMs:3000,sleep:async ms=>delays.push(ms),complete:async()=>{calls++;throw error}}),err=>err===error)
 assert.equal(calls,1);assert.deepEqual(delays,[])
 const responses=[Object.assign(Error('capacity'),{status:503,headers:{'retry-after':'2'}}),{ok:true}]
 await e.resilientCompletion({}, {}, {maxWaitMs:4000,random:()=>0,sleep:async ms=>delays.push(ms),complete:async()=>{const value=responses.shift();if(value instanceof Error)throw value;return value}})
 assert.deepEqual(delays,[2000])
})
test('bad requests and authentication failures are never capacity retries',async()=>{
 for(const status of [400,401,403,404]){
  const e=create();let calls=0
  await assert.rejects(e.resilientCompletion({}, {}, {sleep:async()=>assert.fail('must not wait'),complete:async()=>{calls++;throw {status}}}),error=>error.status===status)
  assert.equal(calls,1)
 }
})
test('transport timeout and model catalog capacity errors can recover',async()=>{
 const e=create();let calls=0
 const value=await e.resilientCompletion({}, {}, {maxWaitMs:2000,random:()=>0,sleep:async()=>{},complete:async()=>{if(++calls===1)throw Object.assign(Error('timeout'),{name:'APIConnectionTimeoutError'});return 'ok'}})
 assert.equal(value,'ok');assert.equal(calls,2)
 calls=0
 const catalog=await e.resilientModels({}, {maxWaitMs:2000,random:()=>0,sleep:async()=>{},complete:async()=>{if(++calls===1)throw {status:503};return {data:[]}}})
 assert.deepEqual(catalog,{data:[]});assert.equal(calls,2)
})