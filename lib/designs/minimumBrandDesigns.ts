import { DESIGN_LIBRARY } from './library'

export const MIN_BRAND_DESIGNS=3

/** Brand-aware starting directions; rendering inherits the current brand palette and fonts. */
export function withMinimumBrandDesigns(brand:any={}){
 const designs=Array.isArray(brand.designs)?[...brand.designs]:[]
 const order=brand.imageDisposition==='background'?['panorama','spotlight','gallery']:brand.imageDisposition==='framed'?['gallery','editorial','collage']:brand.imageDisposition==='none'?['editorial','poster','blueprint']:['editorial','spotlight','botanical']
 for(const baseId of [...order,...DESIGN_LIBRARY.map(d=>d.id)]){
  if(designs.length>=MIN_BRAND_DESIGNS)break
  if(designs.some(d=>d.baseId===baseId||d.id==='starter-'+baseId))continue
  const design=DESIGN_LIBRARY.find(d=>d.id===baseId)!
  designs.push({id:'starter-'+baseId,baseId,paletteId:'brand',name:design.name,tags:[...design.tags],source:'brand_starter',rationale:'A reusable '+design.name.toLowerCase()+' direction using your brand colors, typography and chosen image style.',headline:brand.name||'Your brand',body:brand.about||'A clear message in your brand voice.',createdAt:new Date().toISOString()})
 }
 return {...brand,designs}
}

/** Compare-and-set prevents concurrent readers from overwriting a generated design. */
export async function ensureMinimumBrandDesigns(db:any,flow:any){
 for(let attempt=0;attempt<3&&flow;attempt++){
  const previous=flow.brandContext?.designs
  if(Array.isArray(previous)&&previous.length>=MIN_BRAND_DESIGNS)return flow
  const brand=withMinimumBrandDesigns(flow.brandContext||{})
  const result=await db.collection('flows').updateOne({id:flow.id,'brandContext.designs':previous===undefined?{$exists:false}:previous},{$set:{'brandContext.designs':brand.designs}})
  if(result.matchedCount)return {...flow,brandContext:brand}
  flow=await db.collection('flows').findOne({id:flow.id})
 }
 if(!flow)throw Error('Brand no longer exists')
 if((flow.brandContext?.designs?.length||0)<MIN_BRAND_DESIGNS)throw Error('Brand designs changed while adding starter designs. Please reload.')
 return flow
}
