import Groq from 'groq-sdk'
/** Shared queue with independent credential cooldowns and immediate quota failover. */
const stateKey=Symbol.for('kand.groq.key-pool.v1')
const root=globalThis as any
const state=root[stateKey]||(root[stateKey]={tail:Promise.resolve(),cooldowns:new Map(),clients:new Map(),anonymous:new WeakMap(),active:null})
export function groqKeys() {
 const numbered=Array.from({length:10},(_,index)=>process.env[index?'GROQ_API_KEY_'+(index+1):'GROQ_API_KEY'])
 const listed=(process.env.GROQ_API_KEYS||'').split(/[;,\s]+/)
 return [...new Set([...numbered,...listed].map(k=>k?.trim()).filter(Boolean))]
}
export function retrySeconds(error:any) {
 const header=Number(error.headers?.get?.('retry-after')||error.headers?.['retry-after'])
 const message=error.error?.error?.message||error.message||''
 const duration=message.match(/try again in\s+((?:[\d.]+[hms])+)/i)?.[1]||''
 const seconds=[...duration.matchAll(/([\d.]+)([hms])/g)].reduce((n,m)=>n+Number(m[1])*({h:3600,m:60,s:1}[m[2]]||1),0)
 return Math.max(1,Math.ceil(header||seconds||60))
}
export async function budgetedCompletion(groq:any,request:any,backups?:any[],operation='completion') {
 const run=async()=>{
  const keys=groqKeys()
  const clients=[groq,...(backups||keys.filter(key=>key!==groq.apiKey).map(key=>{
   if(!state.clients.has(key))state.clients.set(key,new Groq({apiKey:key,maxRetries:0,timeout:60000}))
   return state.clients.get(key)
  }))]
  const identify=(client:any)=>{
   if(client.apiKey)return client.apiKey
   if(!state.anonymous.has(client))state.anonymous.set(client,Symbol())
   return state.anonymous.get(client)
  }
  const unique=clients.filter((c,i)=>clients.findIndex(d=>identify(c)===identify(d))===i)
  if(state.active)unique.sort((a,b)=>Number(identify(b)===state.active)-Number(identify(a)===state.active))
  let authError:any
  for(const client of unique) {
   const id=identify(client)
   if((state.cooldowns.get(id)||0)>Date.now())continue
   try {const response=operation==='models'?await client.models.list():await client.chat.completions.create(request);state.active=id;return response}
   catch(error:any){
    if(error.status===429){state.cooldowns.set(id,Date.now()+retrySeconds(error)*1000);continue}
    if(error.status===401){authError=error;state.cooldowns.set(id,Date.now()+60000);continue}
    throw error
   }
  }
  if(authError)throw authError
  const wait=Math.max(1,Math.ceil((Math.min(...unique.map(c=>state.cooldowns.get(identify(c))||Date.now()))-Date.now())/1000))
  throw Object.assign(new Error('All configured AI keys are cooling down. Retry in '+wait+' seconds.'),{status:429,headers:{'retry-after':String(wait)}})
 }
 const work=state.tail.then(run,run);state.tail=work.catch(()=>{});return work
}
/** Capacity and transport failures are temporary; invalid requests are not. */
export function isTransientProviderError(error:any) {
 return [408,429,500,502,503,504].includes(Number(error?.status)) ||
  ['APIConnectionError','APIConnectionTimeoutError','TimeoutError'].includes(error?.name) ||
  ['ECONNRESET','ETIMEDOUT','EAI_AGAIN'].includes(error?.code || error?.cause?.code)
}
function providerRetryAfterMs(error:any) {
 const value=error?.headers?.get?.('retry-after') ?? error?.headers?.['retry-after']
 if(value==null)return 0
 const seconds=Number(value)
 if(Number.isFinite(seconds))return Math.max(0,seconds*1000)
 const date=Date.parse(String(value))
 return Number.isFinite(date)?Math.max(0,date-Date.now()):0
}
/** A finite retry budget shared by rate limits, capacity errors and timeouts. */
export async function retryProviderOperation(operation:()=>Promise<any>,options:any={}) {
 const maxWaitMs=Math.max(0,options.maxWaitMs??180000)
 const maxRetries=Math.max(0,options.maxRetries??4)
 const sleep=options.sleep||((ms:number)=>new Promise(resolve=>setTimeout(resolve,ms)))
 const random=options.random||Math.random
 const started=Date.now()
 let waited=0
 for(let attempt=0;;attempt++){
  try{return await operation()}
  catch(error:any){
   if(!isTransientProviderError(error)||attempt>=maxRetries)throw error
   const exponential=Math.min(8000,1000*2**attempt)
   const delay=Number(error.status)===429
    ? Math.max(providerRetryAfterMs(error),(retrySeconds(error)+1)*1000)
    : Math.max(providerRetryAfterMs(error),Math.ceil(exponential*(1+random()*.25)))
   if(Math.max(Date.now()-started,waited)+delay>maxWaitMs)throw error
   await sleep(delay)
   waited+=delay
  }
 }
}
export async function resilientCompletion(groq:any,request:any,options:any={}) {
 const complete=options.complete||budgetedCompletion
 return retryProviderOperation(()=>complete(groq,request),options)
}
export function budgetedModels(groq:any) {return budgetedCompletion(groq,null,undefined,'models')}
export async function resilientModels(groq:any,options:any={}) {
 const catalogKey=groq.apiKey||groq
 state.catalogs||=new Map()
 const cached=state.catalogs.get(catalogKey)
 if(cached?.expires>Date.now())return cached.value
 const complete=options.complete||budgetedModels
 const value=await retryProviderOperation(()=>complete(groq),{maxWaitMs:120000,...options})
 state.catalogs.set(catalogKey,{value,expires:Date.now()+600000})
 return value
}
export function compactBrand(brand:any) {
 const out:any={}
 const limits:Record<string,number>={about:2400,description:800,services:1800,projects:2400,targetAudience:900,tone:500,suggestedCtas:700,differentiators:900,contentTopics:1000}
 for(const key of ['name','about','description','industry','services','products','projects','audience','targetAudience','values','tone','language','languageVariant','profileLanguage','positioning','differentiators','suggestedCtas','contentTopics']) {
  const value=brand?.[key]
  if(value!=null)out[key]=(typeof value==='string'?value:JSON.stringify(value)).slice(0,limits[key]||450)
 }
 if(Array.isArray(brand?.researchSources))out.researchSources=brand.researchSources.slice(0,3).map((page:any)=>({url:String(page.url||'').slice(0,240),title:String(page.title||'').slice(0,120)}))
 return out
}
