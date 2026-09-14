/** Resolve old canvases through their owning flow, never by an ambiguous brand name. */
export async function canvasBrand(db:any, canvas:any) {
 const embedded=canvas.designInput?.brandContext || canvas.brandContext || {}
 const id=canvas.flowId || embedded.id
 let flow=id?await db.collection('flows').findOne({id}):null
 if(!flow && canvas.id) {
  flow=await db.collection('flows').findOne({$expr:{$anyElementTrue:{$map:{input:{$objectToArray:{$ifNull:['$creationState.designResults',{}]}},as:'entry',in:{$eq:['$$entry.v.canvas.id',canvas.id]}}}}})
 }
 return flow?.brandContext?{...flow.brandContext,id:flow.id}:embedded
}
