/** Shared contract for AI-authored designs; no family or composition IDs. */
export const BLUEPRINT_BRIEF = `Author three original reusable visual systems, not selections from existing layouts. Return JSON {designs:[{name,tags,rationale,paletteId,blueprint:{version:1,identity,compositions,theme,spacing,highlight,imagery,complementary,templates}}]}.
compositions: choose 4 or more distinct composition rules in an ordered array from split,image-first,banner,editorial,poster,cards,statistic,closing. Order expresses this identity rhythm. Application selects by content purpose and length using code, with no AI call. identity: concise art direction describing signature shapes, typography, depth, spacing and allowed layout variations. Templates are illustrative examples, not fixed layouts; posts are recomposed from this identity. Choose paletteId automatically for brand fit: brand|secondary|light|dark|bold. theme: studio|atmospheric|vibrant|technical. spacing: compact|balanced|generous.
highlight: none|underline|color|background|font|gradient_text|gradient_background|boxed_gradient_text. boxed_gradient_text means a solid highlight box containing gradient-filled letters; gradient_background means a gradient highlight box behind solid letters. Choose ONE style for the entire design, applied selectively to concise phrases, never every slide.
imagery:{style:photograph|drawing,subject:person|object|scene|none,placement:cutout|background|framed|none,brief:string}. Describe art direction, realistic or illustrated materials, action, camera angle, crop, lighting, clothing, image filters. Let post content determine the specific action. No invented product interfaces or logos. For cutouts, place the bottom crop flush with the canvas edge or behind a foreground panel. For background photos, put readable text over gradient scrims. For none, compose expressive typography with no images.
complementary: false. Use ONLY extracted brand hues, their tints/shades and neutral black/white. Never introduce complementary or invented accent hues. Full-canvas gradients must use bg and gradTo tonal roles; use solid brand color panels for contrast. Fonts MUST be inherited from the brand; do not invent font names.
templates:{cover:{background,elements},content:{background,elements},closing:{background,elements}}. Design ALL THREE with consistent visual language and DIFFERENT geometry, scale and emphasis. No copy-paste. Cover: bold headline, no body paragraph. Content: space for a 12-word title and 45-word body. Closing: headline, body and CTA.
Canvas: 1080x1080. Background {type:solid|gradient|radial|image,color:paletteRole,to:paletteRole,angle:0..360}. Mix backgrounds with decorative elements, colored panels, gradients and overlays. Palette roles: bg,surface,primary,accent,text,mutedText,gradFrom,gradTo.
Each element {type,x,y,width,height,layer,opacity,...}. Coordinates in pixels; max 1080, copy margins 72, all boxes within canvas. At most 12 elements per template. Types: text,image,shape,line,circle,ring,pill,frame,gradient,glow,dots,grid,badge,card,number. Use only these actual renderer capabilities.
Text: role headline|body|eyebrow|cta; size 24..120, minSize 22..40, weight 300..900, align left|center|right, lineHeight 1.05..1.6, letterSpacing -2..8, color, shadow boolean. Allocate headline space for 12 words at a minimum 40px font: e.g. 850x130, 420x220 or 360x280. Vary proportions with the composition. Body box at least 230px high on content. Required: cover has one headline and no body; content has one headline and one body; closing has headline, body and CTA (CTA y>=950). CTA is optional on cover/content. Cutout/framed imagery MUST include an element with type:image and numeric x,y,width,height on at least one template. Image size follows the composition; other slides can be text-only. Do not overlap text boxes or place any decoration over text. Never put literal copy in elements: roles bind post content. Do not generate headline or body copy. Previews use fixed mock text, a mock subject and mock logo; focus entirely on design geometry, hierarchy, styling and brand fit. Do not set fonts: inherit heading/body from extracted brand.
Image: assetId subject, image_variant subject|photo, treatment natural|darken|desaturate|warm|cool|high_contrast|duotone, radius 0..100, mask none|circle|rounded|pill. Keep cutout boxes separate from text, including CTA. Background images may sit behind text scrims.
Decorations: fill,color,to palette roles; rotation -15..15; radius,stroke,angle. Gradient opacity and endOpacity 0..100 for scrims. glow radial fades automatically. card/shape can have shadow boolean. Layers -20..20 create flat, two-plane or deeper compositions. Text renders above decoration; never depend on an image covering text. Use asymmetry, negative space, image bleed, oversized numerals, offset panels, subtle contour/ring accents, grid/dot textures, focal lighting, angular planes and meaningful visual hierarchy selectively. Shadows should be restrained and directional, never dark bands. Use varied visual combinations across designs. Do not use rings and dark gradients for everything. Avoid a small heading and body at the top, empty middle and tiny bottom CTA. Each text-only slide needs a dominant typographic focal point (headline 100–120px in a generous box), plus a deliberate panel, rule or offset accent. Place the body next to or below this focal point. Use restrained tonal lighting and asymmetric layers rather than a full-canvas two-color wash.`

const TYPES = new Set(['text','image','shape','line','circle','ring','pill','frame','gradient','glow','dots','grid','badge','card','number'])
const ROLES = ['bg','surface','primary','accent','text','mutedText','gradFrom','gradTo']
const pick = (value:any, choices:string[], fallback:string) => choices.includes(value)?value:fallback
const COMPOSITIONS=['split','image-first','banner','editorial','poster','cards','statistic','closing']
export function composeIdentity(blueprint:any,copy:any,slot:any,index:number,total:number) {
 const chapter=total===1?'content':index===0?'cover':index===total-1?'closing':'content'
 const reference=blueprint.templates[chapter]
 const rules=blueprint.compositions?.length?blueprint.compositions:['split','image-first','banner','editorial','poster']
 const body=String(copy.body||'')
 const seed=Array.from(String(blueprint.identity||'')+String(copy.headline||'')).reduce((n,c)=>((n*31+c.charCodeAt(0))>>>0),0)
 const list=/(?:^|\n|→)\s*(?:[•●▪*-]|\d+[.)]?)\s+/m.test(body)
 const stat=/\d+(?:[.,]\d+)?\s*%/.test(String(copy.headline||''))
 const image=blueprint.imagery?.placement!=='none'&&!!slot.resolvedAsset?.url
 let kind=chapter==='closing'?'closing':list?'cards':stat?'statistic':rules[(index+(body.length>220?1:0))%rules.length]
 if(!image&&['split','image-first','banner'].includes(kind))kind=index%2?'editorial':'poster'
 if(body.length>350&&chapter==='content')kind='cards'
 if(body.length>120&&kind==='image-first'&&chapter==='content')kind='split'
 const boxes:any={
  split:[[72,110,480,300],[72,450,440,440],[560,250,448,660]],
  'image-first':[[72,630,936,180],[72,840,936,90],[120,110,840,480]],
  banner:[[72,100,936,240],[600,450,408,460],[72,400,480,510]],
  editorial:[[72,110,936,280],[320,460,688,430],[72,500,210,310]],
  poster:[[72,140,936,420],[72,620,850,280],[760,690,240,200]],
  cards:[[72,110,936,230],[72,390,936,530],[800,120,200,210]],
  statistic:[[72,160,936,340],[400,570,608,330],[72,570,280,330]],
  closing:[[72,140,936,320],[72,520,520,350],[640,500,368,370]],
 }
 const b=(boxes[kind]||boxes.editorial).map((v:number[])=>[...v])
 if(chapter==='cover') {
  if(image&&seed%3===0) {b[0]=[72,150,480,600];b[2]=[580,150,428,770]}
  else if(image&&seed%3===1) {b[0]=[72,680,936,240];b[2]=[140,110,800,520]}
  else {b[0]=[72,110,936,image?280:540];if(image)b[2]=[72,430,936,490]}
 }
 // Tune proportion and alignment to the post, without moving copy into imagery.
 if(kind==='split'&&chapter!=='cover') {
  const left=body.length>220?500:420+(seed%3)*24
  b[0][2]=left;b[1][2]=left;b[2][0]=72+left+48;b[2][2]=1008-b[2][0]
 }
 if(seed%2)for(const v of b)v[0]=1080-v[0]-v[2]
 const offset=(seed%3)*12
 for(const v of b)if(v[1]+v[3]+offset<=920)v[1]+=offset
 const box=(v:number[])=>({x:v[0],y:v[1],width:v[2],height:v[3]})
 const title=reference.elements.find((e:any)=>e.role==='headline')||{}
 const paragraph=reference.elements.find((e:any)=>e.role==='body')||{}
 const visual=reference.elements.find((e:any)=>e.type==='image')||{}
 const showImage=image&&(chapter==='cover'||!['cards','statistic','poster','editorial'].includes(kind))
 const elements=reference.elements.filter((e:any)=>!e.role&&e.type!=='image').slice(0,4).map((e:any,i:number)=>{
  // Decorations follow the new focal area, rather than retaining obsolete template positions.
  if(e.type==='gradient'||e.type==='glow')return {...e,type:'glow',x:Math.max(0,b[2][0]-80),y:Math.max(0,b[2][1]-80),width:Math.min(1080-Math.max(0,b[2][0]-80),b[2][2]+160),height:Math.min(1080-Math.max(0,b[2][1]-80),b[2][3]+160),color:'primary',opacity:12,endOpacity:0,layer:-8,shadow:false}
  if(e.type==='line')return {...e,x:b[0][0],y:Math.max(80,b[0][1]-24),width:Math.min(160,b[0][2]*.3),height:2,opacity:45,layer:-5}
  if(['shape','card','frame','circle','ring'].includes(e.type))return {...e,x:Math.max(0,b[2][0]-20+i*8),y:Math.max(0,b[2][1]+20),width:Math.min(b[2][2],1040-b[2][0]),height:Math.min(b[2][3],1040-b[2][1]),opacity:Math.min(e.opacity??20,showImage?18:10),layer:-6,shadow:false}
  return {...e,opacity:Math.min(e.opacity??12,12),layer:-7}
 })
 elements.push({...title,type:'text',role:'headline',...box(b[0]),size:kind==='poster'||kind==='statistic'?110:chapter==='cover'?96:76})
 if(chapter!=='cover'&&copy.body)elements.push({...paragraph,type:'text',role:'body',...box(b[1]),size:body.length>250?28:32})
 if(showImage)elements.push({...visual,type:'image',...box(b[2]),image_variant:blueprint.imagery.placement==='cutout'?'subject':'photo',layer:2})
 if(copy.cta)elements.push({type:'text',role:'cta',x:72,y:956,width:680,height:64,size:26,color:'text'})
 if(copy.eyebrow)elements.push({type:'text',role:'eyebrow',x:72,y:48,width:800,height:40,size:22,color:'text'})
 return {...reference,composition:kind,elements}
}
export function normalizeBlueprint(raw:any, issues:string[]=[]): any | null {
 const reject=(message:string)=>{issues.push(message);return null}
 if (!raw?.templates) return reject('Missing templates object')
 const templates:any={}
 for (const name of ['cover','content','closing']) {
  const template=raw.templates[name]
  if (!Array.isArray(template?.elements)) return reject('Missing '+name+' elements array')
  const elements=template.elements.filter((e:any)=>e && !(name==='cover'&&e.role==='body') && TYPES.has(e.type) && [e.x,e.y,e.width,e.height].every(Number.isFinite) && e.width>0 && e.height>0).slice(0,24).map((e:any)=>{
   const out:any={...e}; delete out.font; delete out.text; delete out.url; delete out.src
   out.x=Math.max(0,Math.min(1060,e.x));out.y=Math.max(0,Math.min(1060,e.y));out.width=Math.min(e.width,1080-out.x);out.height=Math.min(e.height,1080-out.y)
   if(e.type==='text'||e.type==='badge') {
    const heading=e.role==='headline'
    out.size=Math.max(heading?64:24,Math.min(heading?120:42,Number.isFinite(e.size)?e.size:heading?86:30))
    out.weight=Number.isFinite(e.weight)?Math.max(300,Math.min(900,e.weight)):heading?800:400
    out.color='text'
   }
   out.color=pick(out.color||e.color,ROLES,e.type==='text'?'text':'accent');out.fill=pick(e.fill,ROLES,'surface');out.to=pick(e.to,ROLES,'gradTo');out.shadow=e.shadow===true
   return out
  })
  const texts=elements.filter((e:any)=>e.type==='text'||e.type==='badge')
  const required=name==='cover'?['headline']:name==='content'?['headline','body']:['headline','body','cta']
  if(required.some(role=>texts.filter((e:any)=>e.role===role).length!==1))return reject(name+': require exactly one '+required.join(', ')+' text role with numeric pixel coordinates')
  if(texts.some((a:any,i:number)=>texts.slice(i+1).some((b:any)=>a.x<b.x+b.width+12 && a.x+a.width+12>b.x && a.y<b.y+b.height+12 && a.y+a.height+12>b.y)))return reject(name+': text boxes overlap; separate them by 12px')
  const headline=texts.find((e:any)=>e.role==='headline')
  // Judge copy capacity, not one mandated aspect ratio. Grow only into free space.
  const obstacles=elements.filter((e:any)=>e!==headline&&(texts.includes(e)||e.type==='image'))
  const fits=(box:any)=>!obstacles.some((e:any)=>box.x<e.x+e.width+12&&box.x+box.width+12>e.x&&box.y<e.y+e.height+12&&box.y+box.height+12>e.y)
  const capacity=(box:any)=>Math.floor(box.width/(40*.56))*Math.floor(box.height/(40*1.08))
  if(capacity(headline)<72) {
   const heights=[headline.height,180,240,320].filter(h=>h>=headline.height&&headline.y+h<=1008)
   const widths=[headline.width,420,600,936].filter(w=>w>=headline.width&&headline.x+w<=1008)
   const options=widths.flatMap(width=>heights.map(height=>({...headline,width,height}))).filter(box=>capacity(box)>=72&&fits(box)).sort((a,b)=>a.width*a.height-b.width*b.height)
   if(options[0])Object.assign(headline,options[0])
   else return reject(name+': leave room for a 12-word headline at 40px or larger, clear of other text and images')
  }
  if(!elements.some((e:any)=>e.type==='image') && template.background?.type!=='image') {
   // Use available space for the focal title, preserving authored alignment and position.
   const enlarged={...headline,height:Math.min(420,1008-headline.y)}
   if(enlarged.height>headline.height&&fits(enlarged)) {
    headline.height=enlarged.height
    headline.size=Math.max(headline.size,100)
   }
  }
  const bg=template.background||{}
  templates[name]={background:{type:pick(bg.type,['solid','gradient','radial','image'],'solid'),color:pick(bg.color,ROLES,'bg'),to:pick(bg.to,ROLES,'gradTo'),angle:Number.isFinite(bg.angle)?bg.angle:135},elements}
 }
 if(['cutout','framed'].includes(raw.imagery?.placement) && !Object.values(templates).some((t:any)=>t.elements.some((e:any)=>e.type==='image'&&e.width>=96&&e.height>=96)))return reject('Imagery is cutout/framed but no usable image element exists. Add type:image with x,y,width,height in pixels on at least one template; use placement:none for a text-only design.')
 return {version:1,compositions:[...new Set((Array.isArray(raw.compositions)?raw.compositions:COMPOSITIONS.slice(0,5)).filter((c:any)=>COMPOSITIONS.includes(c)))],identity:String(raw.identity||'').slice(0,700),theme:pick(raw.theme,['studio','atmospheric','vibrant','technical'],'studio'),spacing:pick(raw.spacing,['compact','balanced','generous'],'compact'),highlight:pick(raw.highlight,['none','underline','color','background','font','gradient_text','gradient_background','boxed_gradient_text'],'none'),complementary:false,imagery:{style:pick(raw.imagery?.style,['photograph','drawing'],'photograph'),subject:pick(raw.imagery?.subject,['person','object','scene','none'],'person'),placement:pick(raw.imagery?.placement,['cutout','background','framed','none'],'cutout'),brief:String(raw.imagery?.brief||'').slice(0,1200)},templates}
}
export function blueprintSpec(blueprint:any,slot:any,copy:any,index:number,total:number,authored?:any) {
 const chapter=total===1?'content':index===0?'cover':index===total-1?'closing':'content'
 const original=authored||composeIdentity(blueprint,copy,slot,index,total)
 // Reference layouts express the identity; intermediate slides vary their composition.
 const template={...original,elements:original.elements.map((e:any)=>({...e}))}
 const elements=template.elements.filter((e:any)=>!(e.role && !copy[e.role]) && !(e.type==='image' && (blueprint.imagery.placement==='none'||!slot.resolvedAsset?.url))).map((e:any)=>({...e,assetId:e.type==='image'?slot.slot_id:undefined,image_variant:blueprint.imagery.placement==='cutout'?'subject':'photo'}))
 const tonal=['gradient','radial'].includes(template.background.type)
 return {...template,background:{...template.background,...(tonal?{color:'bg',to:'gradTo'}:{}),type:template.background.type==='image'&&blueprint.imagery.placement==='none'?'solid':template.background.type},elements}
}
export function complementaryAccent(hex:string) {
 if(!/^#[0-9a-f]{6}$/i.test(hex))return hex
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)), high=Math.max(...rgb),low=Math.min(...rgb)
 return '#'+rgb.map(v=>(high+low-v).toString(16).padStart(2,'0')).join('')
}

export function isPlaceholderCopy(value:any) {
 return typeof value!=='string'||!value.trim()||/^(headline|title|body|description|text|sample( text)?|placeholder|your headline|your title|t[ií]tulo|descri[cç][aã]o)$/i.test(value.trim())
}
