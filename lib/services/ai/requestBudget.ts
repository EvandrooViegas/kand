import Groq from 'groq-sdk'
/** Shared queue with independent credential cooldowns and immediate quota failover. */
const stateKey=Symbol.for('kand.groq.key-pool.v1')
const root=globalThis as any
const state=root[stateKey]||(root[stateKey]={tail:Promise.resolve(),cooldowns:new Map(),clients:new Map(),anonymous:new WeakMap(),active:null})
export function groqKeys() {
 return [...new Set([process.env.GROQ_API_KEY,process.env.GROQ_API_KEY_2].map(k=>k?.trim()).filter(Boolean))]
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
   if(!state.clients.has(key))state.clients.set(key,new Groq({apiKey:key,maxRetries:0}))
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
export function budgetedModels(groq:any) {return budgetedCompletion(groq,null,undefined,'models')}
export function compactBrand(brand:any) {
 const out:any={}
 for(const key of ['name','about','description','industry','services','products','audience','targetAudience','values','tone','language','positioning','differentiators']) {
  const value=brand?.[key]
  if(value!=null)out[key]=(typeof value==='string'?value:JSON.stringify(value)).slice(0,key==='about'||key==='description'?900:450)
 }
 return out
}
