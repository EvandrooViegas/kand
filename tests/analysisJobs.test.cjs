const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),{stripTypeScriptTypes}=require('node:module')
const source=stripTypeScriptTypes(fs.readFileSync('lib/designs/global/analysisJobs.ts','utf8').replace(/^import .*$/gm,'').replace(/export /g,''))
function setup(analyze) {
 const row={_id:'job',id:'job',status:'queued',attempts:0,total:5,completed:0,referenceImages:[],familyId:'family-job',nextRunAt:new Date(0)},saved=[],timers=[]
 const matches=(q)=>Object.entries(q).every(([k,v])=>k==='$or'?v.some(matches):v&&typeof v==='object'&&!(v instanceof Date)?Object.entries(v).every(([op,value])=>op==='$in'?value.includes(row[k]):op==='$lte'?row[k]<=value:op==='$lt'?row[k]<value:false):row[k]===v)
 const update=u=>{Object.assign(row,u.$set);for(const [k,v]of Object.entries(u.$inc||{}))row[k]=(row[k]||0)+v;for(const k of Object.keys(u.$unset||{}))delete row[k]}
 const collection={findOne:async q=>matches(q)?structuredClone(row):null,updateOne:async(q,u)=>{if(!matches(q))return {matchedCount:0};update(u);return {matchedCount:1}},findOneAndUpdate:async(q,u)=>{if(!matches(q))return null;update(u);return structuredClone(row)}}
 const api=new Function('globalThis','randomUUID','analyzeDesignReferences','saveGlobalDraft','getGlobalRecord','isTransientProviderError','setTimeout',source+';return {runAnalysisJob,readAnalysisJob,retryAnalysisJob}')({},crypto.randomUUID,analyze,async(_db,f)=>saved.push(f),async()=>({}),e=>[429,503,504].includes(e.status),fn=>{timers.push(fn);return {unref(){}}})
 return {api,db:{collection:()=>collection},row,saved,timers}
}
test('background job persists progress and saves exactly one unpublished draft',async()=>{
 const f=setup(async(_db,_input,hooks)=>{await hooks.onProgress({stage:'variations none',completed:4,total:5});return {id:'temporary'}})
 await f.api.runAnalysisJob(f.db,'job')
 assert.equal(f.row.status,'completed');assert.equal(f.row.completed,5);assert.equal(f.saved[0].id,'family-job')
 await f.api.runAnalysisJob(f.db,'job');assert.equal(f.saved.length,1)
})
test('capacity failure schedules a cached automatic resume with a finite limit',async()=>{
 const f=setup(async()=>{throw {status:503,message:'capacity'}})
 await f.api.runAnalysisJob(f.db,'job');assert.equal(f.row.status,'retrying');assert.equal(f.timers.length,1)
 f.row.attempts=2;f.row.nextRunAt=new Date(0)
 await f.api.runAnalysisJob(f.db,'job');assert.equal(f.row.status,'failed');assert.equal(f.timers.length,1)
})
test('a live lease prevents duplicate execution and an expired lease is recoverable',async()=>{
 let calls=0;const f=setup(async()=>{calls++;return {id:'temp'}})
 f.row.status='running';f.row.leaseUntil=new Date(Date.now()+90000)
 await f.api.runAnalysisJob(f.db,'job');assert.equal(calls,0)
 f.row.leaseUntil=new Date(0)
 await f.api.runAnalysisJob(f.db,'job');assert.equal(calls,1);assert.equal(f.row.status,'completed')
})
test('legacy 413 failures queue themselves once without exposing organization details',async()=>{
 const f=setup(async()=>({id:'temp'}))
 f.row.status='failed';f.row.error='413 Request too large org_private rate_limit_exceeded'
 const value=await f.api.readAnalysisJob(f.db,'job')
 assert.equal(value.status,'queued');assert.equal(value.error,null);assert.equal(f.row.tokenLimitRecovery,true)
 f.row.status='failed';f.row.error='413 org_private'
 const second=await f.api.readAnalysisJob(f.db,'job')
 assert.equal(second.status,'failed');assert.ok(!second.error.includes('org_private'))
})