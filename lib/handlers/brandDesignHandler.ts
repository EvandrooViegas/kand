import { brandDesignRequest } from '@/lib/designs/brandDesignRequest'
import { normalizeBlueprint, isPlaceholderCopy } from '@/lib/designs/brandBlueprint'
import { normalizeBrandDesigns } from '@/lib/designs/normalizeBrandDesigns'
import { availableGroqCompletion } from '@/lib/services/ai/availableGroqCompletion'
import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import Groq from 'groq-sdk'
import { DESIGN_LIBRARY } from '@/lib/designs/library'
import { PALETTE_PICKS } from '@/lib/designs/palettes'

export async function handleBrandDesigns(db: any, body: any) {
  try {
  const flow = await db.collection('flows').findOne({id:body.flowId})
  if (!flow) return NextResponse.json({error:'Save your brand first'},{status:404})
  if (!process.env.GROQ_API_KEY) return NextResponse.json({error:'GROQ_API_KEY is required to generate brand designs'},{status:400})
  const brand = {...flow.brandContext,...body.brandContext,id:flow.id}
  const priorImages=Object.values(flow.creationState?.resolveResults||{}).flatMap((r:any)=>r?.resolved?.slots||[]).map((slot:any)=>slot.resolvedAsset).filter((asset:any)=>asset?.url && (asset.url.startsWith('/api/uploads/') || asset.url.startsWith('https://')))
  const previewAsset=priorImages.find((asset:any)=>asset.subject?.url) || priorImages[0] || null
  const groq = new Groq({apiKey:process.env.GROQ_API_KEY,maxRetries:0})
  let parsed:any={}
  for(let attempt=0;attempt<2;attempt++) {
    const response=await availableGroqCompletion(groq,brandDesignRequest(brand,flow.brandContext?.designs||[],attempt>0))
    const content=response.choices[0]?.message.content || '{}'
    try { parsed=JSON.parse(content.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'')) } catch { parsed={} }
    if(normalizeBrandDesigns(parsed).some((d:any)=>!isPlaceholderCopy(d.headline)&&normalizeBlueprint(d.blueprint)))break

  }
  const designs=normalizeBrandDesigns(parsed).slice(0,1).map((d:any)=>({...d,previewAsset,blueprint:normalizeBlueprint(d.blueprint),artDirection:undefined,id:'brand-'+randomUUID(),baseId:d.baseId,paletteId:d.paletteId,name:String(d.name||brand.name+' design').slice(0,80),tags:(Array.isArray(d.tags)?d.tags:[]).slice(0,4).map((x:any)=>String(x).slice(0,30)),rationale:String(d.rationale||'').slice(0,600),headline:String(d.headline||brand.name).slice(0,120),body:String(d.body||brand.about||'').slice(0,180),createdAt:new Date().toISOString()})).filter((d:any)=>d.blueprint&&!isPlaceholderCopy(d.headline))
  if (!designs.length) return NextResponse.json({error:'The model returned no usable design directions. Please generate again.'},{status:502})
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
