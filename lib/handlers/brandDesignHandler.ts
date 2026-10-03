import { NextResponse } from 'next/server'
import { selectBrandFamilies, listDesignStudies } from '@/lib/designs/global/store'

// Brand Design now imports reviewed global structures; it never invents coordinates.
export async function handleGetBrandDesignStudies(db: any, flowId: string) {
  const flow = await db.collection('flows').findOne({ id: flowId })
  if (!flow) return NextResponse.json({ error: 'Brand not found' }, { status: 404 })
  const studies = (await listDesignStudies(db)).map((record: any) => ({ id: record.id, name: record.study.name, referenceUrl: record.study.referenceImages[0].url, description: record.study.designDNA.personality.description }))
  return NextResponse.json({ studies, selectedStudies: (flow.brandContext?.designs || []).filter((d: any) => d.source === 'study') })
}

export async function handleBrandDesigns(db: any, body: any) {
  try {
    if (typeof body.flowId !== 'string' || !Array.isArray(body.familyIds) || !body.familyIds.every((id: any) => typeof id === 'string')) return NextResponse.json({ error: 'Choose at least one design from the Global Design Library.', code: 'GLOBAL_SELECTION_REQUIRED' }, { status: 400 })
    if (body.studyIds !== undefined && (!Array.isArray(body.studyIds) || !body.studyIds.every((id: any) => typeof id === 'string'))) return NextResponse.json({ error: 'Invalid study selection.' }, { status: 400 })
    return NextResponse.json(await selectBrandFamilies(db, body.flowId, body.familyIds, body.studyIds))
  } catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }) }
}

export async function handleDeleteBrandDesign(db: any, body: any) {
  if (typeof body.flowId !== 'string' || typeof body.designId !== 'string') return NextResponse.json({error:'Flow and design are required'},{status:400})
  const flow = await db.collection('flows').findOne({ id: body.flowId })
  const target = flow?.brandContext?.designs?.find((d: any) => d.id === body.designId)
  if (target?.source === 'global' || target?.source === 'study') {
    const remaining = flow.brandContext.designs.filter((d: any) => d.source === 'global' && d.id !== body.designId).map((d: any) => d.globalFamilyId)
    try { return NextResponse.json(await selectBrandFamilies(db, body.flowId, remaining, flow.brandContext.designs.filter((d: any) => d.source === 'study' && d.id !== body.designId).map((d: any) => d.studyId))) }
    catch (error: any) { return NextResponse.json({ error: error.message }, { status: error.status || 500 }) }
  }
  const result=await db.collection('flows').updateOne({id:body.flowId,'brandContext.designs.id':body.designId,$expr:{$gt:[{$size:{$ifNull:['$brandContext.designs',[]]}},1]}},{$pull:{'brandContext.designs':{id:body.designId}},$set:{updatedAt:new Date()}})
  if (!result.matchedCount) return NextResponse.json({error:'Every brand must keep one design. Select a replacement before deleting it.'},{status:409})
  return NextResponse.json({success:true})
}
