/** Save each design before requesting the next; keep completed work on failure. */
export async function generateBrandBatch({flowId,brand,onSaved,onProgress,request=fetch,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}) {
 let latest=brand
 for(let index=0;index<3;index++) {
  if(index>0){onProgress(index+' design(s) saved. Waiting 61s for Groq’s token window before continuing…');await wait(61000)}
  for(let attempt=0;attempt<5;attempt++) {
   onProgress('Generating design '+(index+1)+' of 3…')
   const response=await request('/api/brand-designs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({flowId,brandContext:latest})})
   const data=await response.json()
   if(response.status===429&&attempt<4) {
    const seconds=Math.max(61,Math.min(120,Number(response.headers.get('retry-after'))||61))
    onProgress('Groq rate limit: waiting '+seconds+'s before design '+(index+1)+' of 3…')
    await wait(seconds*1000)
    continue
   }
   if(!response.ok)throw new Error((data.error||'Generation failed')+(index?' '+index+' completed design(s) are already saved.':''))
   if(!data.brandContext)throw new Error('Generation returned no saved design')
   latest=data.brandContext
   onSaved(latest)
   break
  }
 }
 return latest
}
