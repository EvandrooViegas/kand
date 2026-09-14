import { brandDesignRequest } from '@/lib/designs/brandDesignRequest'
import { normalizeBlueprint } from '@/lib/designs/brandBlueprint'
import { normalizeBrandDesigns } from '@/lib/designs/normalizeBrandDesigns'
import { availableGroqCompletion } from '@/lib/services/ai/availableGroqCompletion'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import Groq from 'groq-sdk'

export async function handleBrandDesigns(db: any, body: any) {
  try {
  const flow = await db.collection('flows').findOne({id:body.flowId})
  if (!flow) return NextResponse.json({error:'Save your brand first'},{status:404})
  if (!process.env.GROQ_API_KEY) return NextResponse.json({error:'GROQ_API_KEY is required to generate brand designs'},{status:400})
  const brand = {...flow.brandContext,...body.brandContext,id:flow.id}
  const groq = new Groq({apiKey:process.env.GROQ_API_KEY,maxRetries:0})
  let parsed:any={}
  let failure=''
  for(let attempt=0;attempt<2;attempt++) {
    const response=await availableGroqCompletion(groq,brandDesignRequest(brand,flow.brandContext?.designs||[],failure||false))
    const content=response.choices[0]?.message.content || '{}'
    try { parsed=JSON.parse(content.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')) } catch { parsed={};failure='JSON was incomplete or malformed. Use at most 5 elements per template and omit optional fields to finish within the output budget.' }
    const issues:string[]=[]
    const valid=normalizeBrandDesigns(parsed).find((d:any)=>normalizeBlueprint(d.blueprint,issues))
    if(valid){parsed={designs:[valid]};break}
    failure=issues[0]||failure||'Return {designs:[{name,blueprint:{templates:{cover,content,closing},imagery}}]} with elements arrays in each template.'
    console.warn('[brand-designs] Invalid response:',response.choices[0]?.finish_reason,failure)
  }
  const designs=normalizeBrandDesigns(parsed).slice(0,1).map((d:any)=>({...d,blueprint:normalizeBlueprint(d.blueprint),artDirection:undefined,id:'brand-'+randomUUID(),baseId:d.baseId,paletteId:d.paletteId,name:String(d.name||brand.name+' design').slice(0,80),tags:(Array.isArray(d.tags)?d.tags:[]).slice(0,4).map((x:any)=>String(x).slice(0,30)),rationale:String(d.rationale||'').slice(0,600),headline:String(d.headline||brand.name).slice(0,120),body:String(d.body||brand.about||'').slice(0,180),createdAt:new Date().toISOString()})).filter((d:any)=>d.blueprint)
  if (!designs.length) return NextResponse.json({error:'Could not complete the design: '+failure},{status:502})
  brand.designs=[...(flow.brandContext?.designs||[]),...designs].slice(-24)
  await db.collection('flows').updateOne({id:flow.id},{$set:{brandContext:brand,updatedAt:new Date()}})
  return NextResponse.json({brandContext:brand,notice:null})
  } catch (error: any) {
    const status = [413,429].includes(error.status) ? error.status : 502
    const retryAfter=Math.max(61,Math.min(120,Number(error.headers?.['retry-after'])||61))
    return NextResponse.json({error: error.status === 401 ? 'Groq authentication failed. Check GROQ_API_KEY.' : error.status === 429 ? 'Groq rate limit reached. Please retry shortly.' : error.status === 413 ? 'The design request exceeds the current Groq token limit. Please retry with a shorter brand description.' : error.message || 'Brand design generation failed. Please retry.'},{status,headers:status===429?{'Retry-After':String(retryAfter)}:{}})
  }
}

export async function handleDeleteBrandDesign(db: any, body: any) {
  if (typeof body.flowId !== 'string' || typeof body.designId !== 'string') return NextResponse.json({error:'Flow and design are required'},{status:400})
  const result=await db.collection('flows').updateOne({id:body.flowId},{$pull:{'brandContext.designs':{id:body.designId}},$set:{updatedAt:new Date()}})
  if (!result.matchedCount) return NextResponse.json({error:'Brand not found'},{status:404})
  return NextResponse.json({success:true})
}
