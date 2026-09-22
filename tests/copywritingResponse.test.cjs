const {test} = require('node:test')
const assert = require('node:assert/strict')
const {stripTypeScriptTypes} = require('node:module')
const source = stripTypeScriptTypes(require('node:fs').readFileSync('lib/handlers/copywritingHandler.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
const valid = {format:'single',headline:'Supported headline',caption:'Supported caption'}
function setup(outputs, catalog = ['canopylabs/orpheus-v1-english','llama-3.3-70b-versatile'], idea = {format:'single'}) {
 const requests=[]
 const run = new Function('Groq','process','loadGenerationBrandContext','EXTRACTED_CONTEXT_RULES','compactBrand','budgetedModels','budgetedCompletion','NextResponse','corsify','cleanCopy','retrySeconds',source+';return handleGenerateCopywriting')(
  class {}, {env:{GROQ_API_KEY:'test'}},async()=>({name:'Brand'}),'',x=>x,async()=>({data:catalog.map(id=>({id}))}),async(_,request)=>{requests.push(request);const output=outputs.shift();if(output instanceof Error)throw output;return {choices:[{message:{content:typeof output==='string'?output:JSON.stringify(output)},finish_reason:'stop'}]}}, {json:(body,options)=>({body,status:options?.status||200})},x=>x,x=>x,()=>60)
 return {requests,run:()=>run({idea},{})}
}
test('requests JSON mode with a chat model, excluding speech models',async()=>{
 const {run,requests}=setup([valid]);assert.equal((await run()).status,200);assert.equal(requests[0].model,'llama-3.3-70b-versatile');assert.deepEqual(requests[0].response_format,{type:'json_object'})
})
test('regenerates malformed JSON once using the original brief',async()=>{
 const {run,requests}=setup(['{ headline: "Example", slides: [], Please return valid JSON',valid]);assert.equal((await run()).status,200);assert.equal(requests.length,2);assert.equal(requests[1].max_tokens,4800);assert.match(requests[1].messages[1].content,/CONTENT BRIEF/)
})
test('regenerates a wordy carousel cover as a short hook and teaser',async()=>{
 const wordy={format:'carousel',slides:[{headline:'A civil construction company can and should also win the digital game',body:'Explanation on the cover',cta:''},{headline:'Start here',body:'Details',cta:''}],caption:'Caption'}
 const concise={format:'carousel',slides:[{headline:'Build beyond the jobsite',body:'See what is holding your growth back.',cta:''},{headline:'Start here',body:'Details',cta:''}],caption:'Caption'}
 const {run,requests}=setup([wordy,concise],undefined,{format:'carousel'})
 const result=await run();assert.equal(result.status,200);assert.equal(requests.length,2)
 assert.equal(result.body.slides[0].headline,'Build beyond the jobsite');assert.equal(result.body.slides[0].body,'See what is holding your growth back.')
 assert.match(requests[1].messages[1].content,/maximum is 10|teaser/)
})
test('rejects invalid output after a bounded retry without returning raw model text',async()=>{
 const {run,requests}=setup(['invalid','null']);const result=await run();assert.equal(result.status,502);assert.equal(requests.length,2);assert.equal(result.body.raw,undefined)
})
test('retries provider JSON validation failures',async()=>{
 const error=Object.assign(new Error('invalid JSON'),{status:400,code:'json_validate_failed'});const {run,requests}=setup([error,valid]);assert.equal((await run()).status,200);assert.equal(requests.length,2)
})
test('preserves quota errors without an extra generation attempt',async()=>{
 const {run,requests}=setup([Object.assign(new Error('quota'),{status:429})]);assert.equal((await run()).status,429);assert.equal(requests.length,1)
})
test('never falls back to an arbitrary speech model',async()=>{
 const {run,requests}=setup([],['canopylabs/orpheus-v1-english']);assert.equal((await run()).status,500);assert.equal(requests.length,0)
})
