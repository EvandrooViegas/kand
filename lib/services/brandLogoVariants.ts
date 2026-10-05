import { generateLogoVariants } from './logoVariants'
import { persistInlineImages } from './persistInlineImages'

export async function ensureBrandLogoVariants(db:any,brand:any){
 const source=brand?.logo
 if(!source)return null
 const existing=brand.logoVariants
 // Variants saved before the ink and bounds measurements are regenerated once, so layouts can keep the logo legible and aligned.
 if(existing?.source===source&&existing.blackTransparent&&existing.whiteTransparent&&'inkLightness' in existing&&'bounds' in existing)return existing
 let input=source
 const local=source.match(/^\/api\/uploads\/([^/?]+)$/)
 if(local){
  const upload=await db.collection('uploads').findOne({id:local[1]})
  if(!upload?.bytes)throw Error('Brand logo upload is missing')
  const bytes=Buffer.isBuffer(upload.bytes)?upload.bytes:Buffer.from(upload.bytes.buffer)
  input=`data:${upload.contentType};base64,${bytes.toString('base64')}`
 }
 const generated=await generateLogoVariants(input)
 const variants=await persistInlineImages(db,{...generated,source})
 if(brand.id)await db.collection('flows').updateOne({id:brand.id,'brandContext.logo':source},{$set:{'brandContext.logoVariants':variants}})
 brand.logoVariants=variants
 return variants
}
