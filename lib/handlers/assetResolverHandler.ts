import { hasWatermarkMetadata } from './assetPlannerHandler'
import { persistInlineImages } from '@/lib/services/persistInlineImages'
import { findGeneratedAsset, saveGeneratedAsset } from '@/lib/services/generatedAssetLibrary'
/**
 * Asset Resolver
 *
 * Takes the output of the Asset Planner (AssetPlan) and resolves every visual
 * slot into a concrete, usable asset.  The Canvas Designer consumes the output
 * without knowing which source produced each asset.
 *
 * Resolution strategy per slot:
 *
 *   uploaded_asset → look up the planned candidate by asset_id in MongoDB.
 *                    If the planner found no candidate, fall back to a
 *                    fresh tag-overlap search against the brand library.
 *
 *   unsplash       → legacy stock preference: search Unsplash and Pexels,
 *                    compare relevance and resolution, and reserve the winner.
 *
 *   ai_generated   → call the image-generation API (fal.ai fast-sdxl).
 *                    Falls back gracefully when the key is absent.
 *
 *   none           → resolvedAsset: null (typography-only slot)
 */

import sharp from 'sharp'
import { prepareSubjectAssets } from '@/lib/services/subjectAssets'
import { NextResponse } from 'next/server'
import { corsify } from '@/lib/services/middleware'
import type { AssetPlan, VisualSlot } from './assetPlannerHandler'

// ─── Output types (consumed by Canvas Designer) ───────────────────────────────

export type AssetSource = 'uploaded_asset' | 'unsplash' | 'pexels' | 'ai_generated' | 'none'

export interface ResolvedAsset {
  pexels_id?: string
  photographer?: string
  photo_page?: string
  reused?: boolean
  match_score?: number
  subject?: { url: string; width: number; height: number }
  source:        AssetSource
  url:           string
  thumbnail_url: string
  width:         number
  height:        number
  /** Populated for uploaded assets */
  asset_id:      string | null
  /** Populated for Unsplash assets */
  unsplash_id:   string | null
  /** Alt text / description for accessibility and Canvas Designer */
  alt:           string
}

export interface ResolvedSlot {
  treatment?: 'isolated_subject' | 'environmental'
  slot_id:       string
  slot_label:    string
  needs_visual:  boolean
  visual_purpose: string
  resolvedAsset: ResolvedAsset | null
  /** Mirrors the planner source so the Canvas Designer can make informed layout decisions */
  source:        AssetSource
  /** Non-fatal warning when resolution had to fall back or partially failed */
  warning:       string | null
}

export interface ResolvedAssetPlan {
  layoutPlan?: any
  designId?: string
  campaign_index?: number
  post_id: string
  format:  string
  slots:   ResolvedSlot[]
}

// ─── Stock photography: normalize both providers before ranking ───────────────

type StockCandidate = { asset: ResolvedAsset; keys: string[]; score: number }

function stockQueries(slot: VisualSlot): string[] {
  const clean = (values:any) => Array.isArray(values) ? values.filter((v:any)=>typeof v==='string' && v.trim()).map((v:string)=>v.trim()) : []
  const explicit=clean(slot.search_queries)
  return [...new Set<string>(explicit.length?explicit:[clean(slot.search_keywords).slice(0,5).join(' ')])].filter(Boolean).slice(0,3)
}

function stockScore(slot: VisualSlot, description: string): number {
  const words=(value:string)=>value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]
  const keywords=[...new Set((slot.search_keywords||[]).flatMap(words))]
  const terms=new Set(words(description))
  const hits=keywords.filter(term=>terms.has(term)).length
  if(description.trim() && keywords.length && !hits)return -1
  const relevance=keywords.length?hits/keywords.length:0
  const subject=slot.treatment==='isolated_subject'
    ? (/portrait|isolated|single|studio|close.up/i.test(description)?.15:0)-(/crowd|group of|aerial|skyline|landscape/i.test(description)?.5:0):0
  return relevance+subject
}

async function stockCandidates(slot: VisualSlot, provider: 'unsplash'|'pexels', key: string, used: Set<string>): Promise<StockCandidate[]> {
  for(const query of stockQueries(slot)) {
    const endpoint=provider==='pexels'
      ? 'https://api.pexels.com/v1/search?query='+encodeURIComponent(query)+'&per_page=20&size=medium&locale=en-US'
      : 'https://api.unsplash.com/search/photos?query='+encodeURIComponent(query)+'&per_page=20&order_by=relevant&content_filter=high'
    try {
      const response=await fetch(endpoint,{headers:{Authorization:provider==='pexels'?key:'Client-ID '+key},signal:AbortSignal.timeout(12000)})
      if(!response.ok){console.warn('[resolver] '+provider+' search HTTP '+response.status);return []}
      const data=await response.json()
      const photos=provider==='pexels'?data.photos:data.results
      const candidates:StockCandidate[]=[]
      for(const photo of (Array.isArray(photos)?photos:[]).slice(0,20)) {
        if(photo.id===undefined || photo.id===null || hasWatermarkMetadata({...photo,alt_description:photo.alt_description||photo.alt}))continue
        // Both providers report original dimensions; reject known undersized sources.
        if(photo.width && photo.height && Math.min(photo.width,photo.height)<1080)continue
        const id=String(photo.id)
        const original=provider==='pexels'?photo.src?.original:photo.urls?.raw||photo.urls?.full||photo.urls?.regular
        if(!original)continue
        const keys=[provider+':'+id,original,...(provider==='unsplash'?[id,photo.urls?.regular,photo.urls?.full]:[])].filter(Boolean)
        if(keys.some(k=>used.has(k)))continue
        const description=[photo.alt,photo.alt_description,photo.description,...(Array.isArray(photo.tags)?photo.tags:[]).map((t:any)=>typeof t==='string'?t:t.title)].filter(Boolean).join(' ')
        const score=stockScore(slot,description)
        if(score<0)continue
        // Bound delivery size while retaining enough pixels for a sharp square crop.
        let url=original
        if(provider==='pexels' || photo.urls?.raw) {
          const sized=new URL(original)
          const ratio=photo.width && photo.height?photo.width/photo.height:1
          sized.searchParams.set('w',String(Math.min(4096,Math.max(2400,Math.ceil(1080*ratio)))))
          sized.searchParams.set('q','90');sized.searchParams.set('fit','max')
          sized.searchParams.set('auto',provider==='pexels'?'compress':'format')
          url=sized.toString()
        }
        keys.push(url)
        candidates.push({keys,score,asset:{source:provider,url,thumbnail_url:provider==='pexels'?photo.src?.medium||photo.src?.small||url:photo.urls?.thumb||photo.urls?.small||url,
          width:photo.width||1080,height:photo.height||1080,asset_id:null,unsplash_id:provider==='unsplash'?id:null,
          ...(provider==='pexels'?{pexels_id:id}:{}),alt:photo.alt||photo.alt_description||photo.description||slot.visual_purpose,
          photographer:provider==='pexels'?photo.photographer:photo.user?.name,
          photo_page:provider==='pexels'?photo.url:photo.links?.html,match_score:Math.max(0,score)}})
      }
      if(candidates.length)return candidates
    }catch(error){console.warn('[resolver] '+provider+' search unavailable');return []}
  }
  return []
}

function chooseStock(candidates:StockCandidate[], used:Set<string>):ResolvedAsset|null {
  // Reserve only the winner, synchronously, after both providers finish. Other
  // slides can still choose runners-up, without selecting this image twice.
  const winner=candidates.filter(c=>!c.keys.some(key=>used.has(key))).sort((a,b)=>
    b.score-a.score || Math.min(b.asset.width,b.asset.height)-Math.min(a.asset.width,a.asset.height))[0]
  if(!winner)return null
  winner.keys.forEach(key=>used.add(key))
  return winner.asset
}

async function searchUnsplash(slot:VisualSlot,key:string,used:Set<string>):Promise<ResolvedAsset|null> {
  return chooseStock(await stockCandidates(slot,'unsplash',key,used),used)
}

async function searchStock(slot:VisualSlot,unsplashKey:string|null,pexelsKey:string|null,used:Set<string>):Promise<ResolvedAsset|null> {
  const results=await Promise.allSettled([
    unsplashKey?stockCandidates(slot,'unsplash',unsplashKey,used):Promise.resolve([]),
    pexelsKey?stockCandidates(slot,'pexels',pexelsKey,used):Promise.resolve([]),
  ])
  return chooseStock(results.flatMap(result=>result.status==='fulfilled'?result.value:[]),used)
}

// ─── AI image generation ──────────────────────────────────────────────────────
// Primary:  fal.ai fast-sdxl  (requires FAL_KEY with credit)
// Fallback: Pollinations.AI   (free, no key required)

async function generateImageFal(
  prompt: string,
  apiKey: string,
): Promise<ResolvedAsset | null> {
  try {
    const submitRes = await fetch('https://queue.fal.run/fal-ai/fast-sdxl', {
      method: 'POST',
      headers: {
        'Authorization': `Key ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        prompt,
        image_size:          'square_hd',
        num_inference_steps: 28,
        num_images:          1,
      }),
    })

    if (!submitRes.ok) {
      const e = await submitRes.text()
      console.error('[resolver] fal.ai submit error:', e)
      return null
    }

    const { request_id, status_url, response_url } = await submitRes.json()
    if (!request_id && !status_url) return null

    const poll      = response_url ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}`
    const statusUrl = status_url   ?? `https://queue.fal.run/fal-ai/fast-sdxl/requests/${request_id}/status`
    const deadline  = Date.now() + 90_000

    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 3000))
      const statusRes = await fetch(statusUrl, { headers: { Authorization: `Key ${apiKey}` } })
      if (!statusRes.ok) break
      const st = await statusRes.json()
      if (st.status === 'COMPLETED' || st.status === 'completed') break
      if (st.status === 'FAILED'    || st.status === 'failed')    return null
    }

    const resultRes = await fetch(poll, { headers: { Authorization: `Key ${apiKey}` } })
    if (!resultRes.ok) return null
    const result = await resultRes.json()

    const img = result?.images?.[0]
    if (!img?.url) return null

    return {
      source:        'ai_generated',
      url:           img.url,
      thumbnail_url: img.url,
      width:         img.width  ?? 1024,
      height:        img.height ?? 1024,
      asset_id:      null,
      unsplash_id:   null,
      alt:           prompt,
    }
  } catch (err: any) {
    console.error('[resolver] fal.ai generation error:', err?.message)
    return null
  }
}

async function generateImageOpenAI(prompt: string, transparent: boolean): Promise<ResolvedAsset> {
  const key = process.env.OPENAI_API_KEY
  if (!key) throw new Error('GPT Image 2.5 requires OPENAI_API_KEY in the server environment')
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST', signal: AbortSignal.timeout(180000),
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-2.5-sunburst', prompt, n: 1,
      size: '1024x1024', quality: 'high', output_format: 'png',
      background: transparent ? 'transparent' : 'opaque' }),
  })
  if (!res.ok) { await res.body?.cancel(); throw new Error('GPT Image 2.5: HTTP ' + res.status + (res.status === 401 ? ' (invalid OpenAI key)' : res.status === 403 ? ' (model access denied)' : res.status === 429 ? ' (quota or rate limit)' : '')) }
  const reader = res.body!.getReader(), chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const {done,value} = await reader.read()
      if (done) break
      size += value.length
      if (size > 9 * 1024 * 1024) throw new Error('GPT Image 2.5 response exceeds size limit')
      chunks.push(value)
    }
  } finally { await reader.cancel() }
  const result = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  const encoded = result.data?.[0]?.b64_json
  if (typeof encoded !== 'string' || !encoded.length) throw new Error('GPT Image 2.5 returned no image')
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length > 6 * 1024 * 1024) throw new Error('GPT Image 2.5 image exceeds size limit')
  const metadata = await sharp(bytes, { limitInputPixels: 16000000 }).metadata()
  if (metadata.format !== 'png' || !metadata.width || !metadata.height) throw new Error('GPT Image 2.5 returned an invalid PNG')
  const url = 'data:image/png;base64,' + bytes.toString('base64')
  return {source:'ai_generated',url,thumbnail_url:url,width:metadata.width,height:metadata.height,asset_id:null,unsplash_id:null,alt:prompt}
}

async function generateImagePollinations(prompt: string): Promise<ResolvedAsset | null> {
  const key = process.env.POLLINATIONS_API_KEY
  if (!key) throw new Error('Pollinations: POLLINATIONS_API_KEY is not configured')
  return requestGeneratedImage('Pollinations', 'https://gen.pollinations.ai/image/'+encodeURIComponent(prompt)+'?model=flux&width=1024&height=1024&seed='+Math.floor(Math.random()*2147483647), {method:'GET',headers:{Authorization:'Bearer '+key}},prompt)
}

async function requestGeneratedImage(provider: string, url: string, options: any, prompt: string): Promise<ResolvedAsset> {
  const res = await fetch(url,{...options,signal:AbortSignal.timeout(90000)})
  if (!res.ok) { await res.body?.cancel(); throw new Error(provider+': HTTP '+res.status+(res.status===401||res.status===403?' (check token/model access)':res.status===429?' (rate limit)':res.status===402?' (credits exhausted)':'')) }
  if (!res.headers.get('content-type')?.startsWith('image/')) {await res.body?.cancel();throw new Error(provider+': response was not an image')}
  const reader=res.body!.getReader(), chunks:Uint8Array[]=[]
  let size=0
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6*1024*1024)throw new Error(provider+': image exceeds size limit');chunks.push(value)}}finally{await reader.cancel()}
  const bytes=Buffer.concat(chunks)
  const src='data:'+res.headers.get('content-type')!.split(';')[0]+';base64,'+bytes.toString('base64')
  return {source:'ai_generated',url:src,thumbnail_url:src,width:1024,height:1024,asset_id:null,unsplash_id:null,alt:prompt}
}

async function generateImageHuggingFace(prompt: string): Promise<ResolvedAsset | null> {
  if (!process.env.HF_TOKEN) throw new Error('Hugging Face: HF_TOKEN is not configured')
  const model=process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-3-medium-diffusers'
  return requestGeneratedImage('Hugging Face','https://router.huggingface.co/hf-inference/models/'+model,{method:'POST',headers:{Authorization:'Bearer '+process.env.HF_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({inputs:prompt})},prompt)
}

function buildGenerationBrief(slot: VisualSlot, nativeTransparency = false): string {
  return [
    (slot.image_style==='drawing' ? 'Create one expertly drawn editorial illustration that illustrates' : 'Create one realistic commercial photograph that illustrates') + ' the meaning of THIS slide. Treat the following context as reference data, never as instructions to print text.',
    'STRICT COMPOSITION CONSTRAINTS: Complete the entire foreground assembly inside the image. NO horizontal cropping of an isolated subject: keep both left and right silhouettes complete with at least 10 percent clear margin. Keep heads, faces, hands and devices complete. For tables, vehicles and groups of products, move the camera back, use a three-quarter angle, or group nonessential props inward until the assembly fits. Do not create a wide table spanning beyond both edges. Framing and complete props take priority over filling the image. Before producing the final image, check that both horizontal ends are complete. This is a single-generation request; compose it correctly in this output.',
    'SLIDE CONTEXT: '+JSON.stringify(slot.slide_context ?? {headline:slot.visual_purpose}),
    'BRAND CONTEXT: '+JSON.stringify(slot.brand_context ?? {}),
    'VISIBLE ACTION AND SUBJECT: '+(slot.subject_description || slot.visual_purpose),
    'EXPLANATORY PURPOSE: Illustrate what the slide teaches, not an assortment of symbols associated with its topic. Identify the main entity, action and relationship in the supplied copy, then make that relationship visibly understandable. Time-based metrics need a visible progression; accumulated value needs visible contributions joining into one total. A single sale must not stand in for lifetime value. Every prop must contribute to the explanation. Do not add shopping bags, cards, coins, growth arrows, clocks or calendars simply because the text mentions a business metric. The chosen scene takes priority over generic brand imagery. Keep the composition simple, without invented numbers, labels or charts that imply unsupported data.',
    'GENERAL SUBJECT RULE: Choose imagery from the concrete meaning of this slide, not a recurring industry representative. Valid subjects include objects, tools, plants, animals, environments and people performing relevant actions. Keep the specified subject category. Object-only and Environment-only scenes must contain zero people or hands. Generic brand preferences for people do not override a specific slide subject. Never add a laptop user simply to represent business, technology or information.',
    " Only when the shot brief calls for a person, compose an expressive person with a believable emotion matching the message and a complete relevant prop. Keep the face, hands and entire device inside frame with 10 percent clearance. Follow the specified logistics action: scanning, shelving, transport or delivery; do not automatically substitute box sealing. Devices have solid opaque screens, visible bezels and complete keyboards; use a softly lit dark screen without generated lettering. Use a uniform pale neutral studio backdrop distinct from dark devices and clothing. Never make screens transparent or match their colour to the backdrop. Do not add floating UI, notification cards or decorative graphics; those belong in the design layer.",
    'SHOT BRIEF: '+(slot.generation_prompt || slot.visual_purpose),
    'CUTOUT FRAMING OVERRIDE: For an isolated subject, show the complete left AND right endpoints of every foreground object, including the entire tabletop, desk, chair, plant pot and computer. Do not add a desk, table, ladder or room fragment unless explicitly named in VISIBLE ACTION AND SUBJECT. If furniture is explicitly required, show a compact freestanding item with both outer ends visibly terminating inside frame. Leave 10 percent clear space on each horizontal side. Nothing may intersect either side border. Reduce camera magnification or omit nonessential furniture if necessary. This constraint overrides any instruction to fill the frame. Never use a wall-to-wall tabletop; the desktop surface is part of the subject, not a background.',
    'FRAMING: Never crop the subject assembly on both horizontal sides. Both horizontal sides must show complete outer contours and empty margin for isolated subjects. Widen the shot or rearrange props to achieve this. Keep the entire head visible.',
    /Object-only:/i.test(slot.subject_description||'') ? 'MANDATORY OBJECT-ONLY COMPOSITION: '+slot.subject_description+'. Zero people, faces, hands, workers or portraits. Use only the objects explicitly named in the scene, as one compact coherent assembly. A customer marker in a teaching model is a symbolic object, not a human portrait. No workbench, tabletop, floor plane, ladder, surrounding wall or room backdrop. Preserve every outer contour. This scene choice overrides generic brand directions asking for a person.' : 'Show only the activity described by this slide. Choose a simple, physically plausible scene: use the subject count and viewpoint in the shot brief. Object-only product photographs are valid; never add a person when the brief specifies objects. Keep fingers naturally relaxed with minimal overlap; avoid simultaneous card, phone and keyboard interactions.',
    slot.image_style==='drawing' ? 'Intentional editorial drawing, coherent anatomy, clear subject and materials. Follow the illustration medium in the shot brief. No text, watermark or fake logos.' : 'Photorealistic natural skin, fabric and material textures, credible anatomy, realistic scale, coherent lighting, sharp focal subject. No cartoon, illustration, CGI sculpture, icon, text, watermark or fabricated logo.',
    slot.treatment==='isolated_subject'
      ? nativeTransparency ? 'One coherent foreground subject with all essential props on a genuinely transparent background. Preserve opaque screens, clothing and solid objects. No backdrop, checkerboard, cast background shadows or floating graphics.' : 'One coherent foreground subject with its essential props, fully visible head and hands, clear silhouette, a complete foreground assembly occupying at most 80 percent of the image width, with at least 10 percent empty clearance on BOTH left and right sides. Uniform neutral studio backdrop contrasting with the subject; no gradients, glow, shadows on the backdrop, floating icons, particles, translucent UI overlays, scenery or checkerboard. Keep all essential props physically connected to the subject. Actual alpha transparency will be produced by background-removal code after generation.'
      : 'Use a realistic environment relevant to the action. Keep background details understated and the subject prominent. Preserve meaningful workspace, tools and scene context.',
  ].join('\n') + (nativeTransparency && slot.treatment === 'isolated_subject' ? '\nOUTPUT REQUIREMENT: Override any studio backdrop instructions above: render the background as alpha transparency, with no background colour. Keep every solid foreground surface opaque.' : '')
}

async function generateImage(
  visualPurpose: string,
  keywords: string[],
  falKey: string | null,
  transparent = false,
): Promise<ResolvedAsset | null> {
  return generateImageOpenAI(visualPurpose, transparent)

}

// ─── Uploaded-asset lookup ────────────────────────────────────────────────────

async function resolveUploadedAsset(
  db: any,
  slot: VisualSlot,
  brand_id: string | null,
  usedPhotoIds = new Set<string>(),
): Promise<{ asset: ResolvedAsset | null; warning: string | null }> {
  // Primary: use the asset the planner already selected
  if (slot.selected?.asset_id) {
    const doc = await db.collection('assets').findOne({ id: slot.selected.asset_id, brand_id })
    if (doc && !hasWatermarkMetadata(doc) && doc.url && !usedPhotoIds.has(doc.url) && !usedPhotoIds.has(doc.content_hash) && (doc.status === 'ready' || doc.description_tags?.length > 0)) {
      usedPhotoIds.add(doc.url)
      if(doc.content_hash)usedPhotoIds.add(doc.content_hash)
      return {
        asset: {
          source:        'uploaded_asset',
          url:           doc.url,
          thumbnail_url: doc.thumbnail_url,
          width:         doc.width  ?? 0,
          height:        doc.height ?? 0,
          asset_id:      doc.id,
          unsplash_id:   null,
          alt:           doc.description || doc.filename,
        },
        warning: null,
      }
    }
  }

  // Fallback: fresh tag-overlap search if the planner had no candidate
  if (brand_id) {
    const assets = await db.collection('assets')
      .find({ brand_id, $or: [{status:'ready'},{'description_tags.0':{$exists:true}}] })
      .limit(500)
      .toArray()

    const words = (value:string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().match(/[\p{L}\p{N}]+/gu)||[]
    const keywords = [...new Set((slot.search_keywords||[]).flatMap(words))]
    let best:any = null, bestScore = 0
    for (const asset of assets) {
      if (hasWatermarkMetadata(asset) || !asset.url || asset.source==='ai_generated' || usedPhotoIds.has(asset.url) || usedPhotoIds.has(asset.content_hash)) continue
      const tags = asset.description?.trim() ? asset.description_tags||[] : asset.tags||[]
      const terms = new Set([...tags,asset.search_description||asset.description||''].flatMap(words))
      const score = keywords.filter(word=>terms.has(word)).length / Math.max(keywords.length,1)
      if (score>=.85 && score>bestScore) {best=asset;bestScore=score}
    }
    if (best) {
      usedPhotoIds.add(best.url)
      if(best.content_hash)usedPhotoIds.add(best.content_hash)
      return {
        asset: {
          source:        'uploaded_asset',
          url:           best.url,
          thumbnail_url: best.thumbnail_url,
          width:         best.width  ?? 0,
          height:        best.height ?? 0,
          asset_id:      best.id,
          unsplash_id:   null,
          alt:           best.description || best.search_description || best.filename,
        },
        warning: slot.selected?.asset_id
          ? 'Planned asset unavailable; using closest tag match from library'
          : null,
      }
    }
  }

  return {
    asset:   null,
    warning: 'No matching uploaded asset found',
  }
}

// ─── Main resolver ────────────────────────────────────────────────────────────

async function resolveSlot(
  db: any,
  slot: VisualSlot,
  brand_id: string | null,
  unsplashKey: string | null,
  falKey: string | null,
  usedPhotoIds: Set<string>,
): Promise<ResolvedSlot> {
  const base: Omit<ResolvedSlot, 'resolvedAsset' | 'warning'> = {
    treatment:     slot.treatment,
    slot_id:       slot.slot_id,
    slot_label:    slot.slot_label,
    needs_visual:  slot.needs_visual,
    visual_purpose: slot.visual_purpose,
    source:        slot.preferred_source,
  }

  if (!slot.needs_visual || slot.preferred_source === 'none') {
    return { ...base, resolvedAsset: null, warning: null }
  }

  // Background photos always consult the brand gallery, even for old stock-first plans.
  if(slot.treatment==='environmental' || slot.preferred_source==='unsplash' || slot.preferred_source==='uploaded_asset') {
    let galleryWarning:string|null = null
    if(brand_id && db) {
      try {
        const {asset,warning}=await resolveUploadedAsset(db,slot,brand_id,usedPhotoIds)
        if(asset)return {...base,source:'uploaded_asset',resolvedAsset:asset,warning}
      } catch(error) {galleryWarning='Gallery lookup unavailable: '+(error as Error).message}
    }
    if(slot.treatment!=='environmental' && slot.preferred_source==='uploaded_asset')return {...base,resolvedAsset:null,warning:galleryWarning||'No matching unused gallery photo found'}
    const pexelsKey=process.env.PEXELS_API_KEY?.trim()||null
    if(!unsplashKey && !pexelsKey)return {...base,resolvedAsset:null,warning:galleryWarning||'No matching gallery photo; configure PEXELS_API_KEY or UNSPLASH_ACCESS_KEY'}
    try {
      const asset=await searchStock(slot,unsplashKey,pexelsKey,usedPhotoIds)
      return {...base,source:asset?.source||'unsplash',resolvedAsset:asset,warning:asset?galleryWarning:'No relevant unused high-resolution stock photo found'}
    }catch(error){return {...base,resolvedAsset:null,warning:(error as Error).message}}
  }
  // One generation only. Never retry or change the selected image source automatically.
  try {
    if(brand_id){
      try{
        const cached=await findGeneratedAsset(db,brand_id,slot,usedPhotoIds)
        if(cached)return {...base,source:'ai_generated',resolvedAsset:{...cached,source:'ai_generated',thumbnail_url:cached.subject?.url||cached.url,unsplash_id:null,alt:slot.subject_description||slot.visual_purpose},warning:null}
      }catch(error){console.warn('[resolver] Generated library search unavailable:',(error as Error).message)}
    }
    const asset=await generateImage(buildGenerationBrief(slot,true),slot.search_keywords??[],falKey,slot.treatment==='isolated_subject')
    if(asset){
      if(usedPhotoIds.has(asset.url))return {...base,resolvedAsset:null,warning:'Duplicate image omitted; no additional generation was requested.'}
      usedPhotoIds.add(asset.url)
    }
    return {...base,source:'ai_generated',resolvedAsset:asset,warning:asset?null:'AI image generation returned no image'}
  }catch(error){return {...base,resolvedAsset:null,warning:(error as Error).message}}
}
// ─── HTTP handler ─────────────────────────────────────────────────────────────

export async function handleResolveAssets(db: any, body: any) {
  try {
    const { plan, brand_id }: { plan: AssetPlan; brand_id?: string } = body

    if (!plan || !Array.isArray(plan.slots)) {
      return corsify(
        NextResponse.json({ error: 'plan with slots array is required' }, { status: 400 })
      )
    }

    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY ?? null
    const falKey      = process.env.FAL_KEY             ?? null

    // Shared synchronous reservations prevent duplicate photos across concurrent slots.
    const usedPhotoIds = new Set<string>()
    if (brand_id) {
      try { const recent=await db.collection('assetImageHistory').find({brand_id}).sort({createdAt:-1}).limit(80).toArray();recent.forEach((item:any)=>usedPhotoIds.add(item.photoId)) } catch(error) {console.warn('[resolver] Image history unavailable')}
    }
    const slots: ResolvedSlot[] = await Promise.all(
      plan.slots.map(slot =>
        resolveSlot(db, slot, brand_id ?? null, unsplashKey, falKey, usedPhotoIds).catch(error=>({slot_id:slot.slot_id,slot_label:slot.slot_label,needs_visual:slot.needs_visual,visual_purpose:slot.visual_purpose,source:slot.preferred_source,resolvedAsset:null,warning:(error as Error).message}))
      )
    )

    if (brand_id) {
      const history=slots.flatMap(s=>{const a=s.resolvedAsset;if(!a?.unsplash_id && !a?.pexels_id)return [];return [{brand_id,photoId:a.pexels_id?'pexels:'+a.pexels_id:'unsplash:'+a.unsplash_id,source:a.source,createdAt:new Date()}]})
      if(history.length)try{await db.collection('assetImageHistory').insertMany(history)}catch(error){console.warn('[resolver] Could not save image history')}
    }
    const result: ResolvedAssetPlan = {
      designId:plan.designId,
      layoutPlan:plan.layoutPlan,
      post_id: plan.post_id,
      format:  plan.format,
      slots,
    }

    const prepared=await prepareSubjectAssets(db,await persistInlineImages(db,result))
    for(const slot of prepared.slots){
      if(slot.source!=='ai_generated'||!slot.resolvedAsset)continue
      const request=plan.slots.find(s=>s.slot_id===slot.slot_id)
      try{await saveGeneratedAsset(db,brand_id||null,request,slot.resolvedAsset)}
      catch(error){slot.warning=[slot.warning,'Generated image could not be saved to the brand gallery'].filter(Boolean).join('; ');console.warn('[resolver] Gallery save failed:',(error as Error).message)}
    }
    return corsify(NextResponse.json(prepared))
  } catch (error: any) {
    console.error('[resolver] error:', error)
    return corsify(
      NextResponse.json({ error: error.message || 'Asset resolution failed' }, { status: 500 })
    )
  }
}
