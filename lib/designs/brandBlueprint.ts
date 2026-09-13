/** Shared contract for AI-authored designs; no family or composition IDs. */
export const BLUEPRINT_BRIEF = `Author three original reusable visual systems, not selections from existing layouts. Return JSON {designs:[{name,tags,rationale,headline,body,paletteId,blueprint:{version:1,theme,spacing,highlight,imagery,complementary,templates}}]}.
paletteId: brand|secondary|light|dark|bold. theme: studio|atmospheric|vibrant|technical. spacing: compact|balanced|generous.
highlight: none|underline|color|background|font|gradient_text|gradient_background|boxed_gradient_text. boxed_gradient_text means a solid highlight box containing gradient-filled letters; gradient_background means a gradient highlight box behind solid letters. Choose ONE style for the entire design, applied selectively to concise phrases, never every slide.
imagery:{style:photograph|drawing,subject:person|object|scene|none,placement:cutout|background|framed|none,brief:string}. Describe art direction, realistic or illustrated materials, action, camera angle, crop, lighting, clothing, image filters. Let post content determine the specific action. No invented product interfaces or logos. For cutouts, place the bottom crop flush with the canvas edge or behind a foreground panel. For background photos, put readable text over gradient scrims. For none, compose expressive typography with no images.
complementary: boolean. Extracted brand colors remain primary; complementary colors can be secondary accents only. Fonts MUST be inherited from the brand; do not invent font names.
templates:{cover:{background,elements},content:{background,elements},closing:{background,elements}}. Design ALL THREE with consistent visual language and DIFFERENT geometry, scale and emphasis. No copy-paste. Cover: bold headline, no body paragraph. Content: space for a 12-word title and 45-word body. Closing: headline, body and CTA.
Canvas: 1080x1080. Background {type:solid|gradient|radial|image,color:paletteRole,to:paletteRole,angle:0..360}. Mix backgrounds with decorative elements, colored panels, gradients and overlays. Palette roles: bg,surface,primary,accent,text,mutedText,gradFrom,gradTo.
Each element {type,x,y,width,height,layer,opacity,...}. Coordinates in pixels; max 1080, copy margins 72, all boxes within canvas. At most 12 elements per template. Types: text,image,shape,line,circle,ring,pill,frame,gradient,glow,dots,grid,badge,card,number. Use only these actual renderer capabilities.
Text: role headline|body|eyebrow|cta; size 24..120, minSize 22..40, weight 300..900, align left|center|right, lineHeight 1.05..1.6, letterSpacing -2..8, color, shadow boolean. Headline box at least 200px high; body box at least 230px high on content. Required each template: one headline and one CTA box (CTA y>=950); content/closing also require one body. Do not overlap text boxes or place any decoration over text. Never put literal copy in elements: roles bind post content. Root headline and body MUST contain actual audience-facing brand copy, never field names like headline, title or description. Do not set fonts: inherit heading/body from extracted brand.
Image: assetId subject, image_variant subject|photo, treatment natural|darken|desaturate|warm|cool|high_contrast|duotone, radius 0..100, mask none|circle|rounded|pill. Keep cutout boxes separate from text, including CTA. Background images may sit behind text scrims.
Decorations: fill,color,to palette roles; rotation -15..15; radius,stroke,angle. Gradient opacity and endOpacity 0..100 for scrims. glow radial fades automatically. card/shape can have shadow boolean. Layers -20..20 create flat, two-plane or deeper compositions. Text renders above decoration; never depend on an image covering text. Use asymmetry, negative space, image bleed, oversized numerals, offset panels, subtle contour/ring accents, grid/dot textures, focal lighting, angular planes and meaningful visual hierarchy selectively. Shadows should be restrained and directional, never dark bands. Use varied visual combinations across designs. Do not use rings and dark gradients for everything.`

const TYPES = new Set(['text','image','shape','line','circle','ring','pill','frame','gradient','glow','dots','grid','badge','card','number'])
const ROLES = ['bg','surface','primary','accent','text','mutedText','gradFrom','gradTo']
const pick = (value:any, choices:string[], fallback:string) => choices.includes(value)?value:fallback
export function normalizeBlueprint(raw:any): any | null {
 if (!raw?.templates) return null
 const templates:any={}
 for (const name of ['cover','content','closing']) {
  const template=raw.templates[name]
  if (!Array.isArray(template?.elements)) return null
  const elements=template.elements.filter((e:any)=>e && TYPES.has(e.type) && [e.x,e.y,e.width,e.height].every(Number.isFinite) && e.width>0 && e.height>0).slice(0,24).map((e:any)=>{
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
  const required=name==='cover'?['headline','cta']:['headline','body','cta']
  if(required.some(role=>texts.filter((e:any)=>e.role===role).length!==1))return null
  if(texts.some((a:any,i:number)=>texts.slice(i+1).some((b:any)=>a.x<b.x+b.width+12 && a.x+a.width+12>b.x && a.y<b.y+b.height+12 && a.y+a.height+12>b.y)))return null
  const headline=texts.find((e:any)=>e.role==='headline')
  if(headline.width<420||headline.height<180)return null
  const placement=raw.imagery?.placement
  if(placement && !['none','background'].includes(placement) && !elements.some((e:any)=>e.type==='image'&&e.width*e.height>=150000))return null
  if(placement==='none' && headline.width*headline.height<240000)return null
  const bg=template.background||{}
  templates[name]={background:{type:pick(bg.type,['solid','gradient','radial','image'],'solid'),color:pick(bg.color,ROLES,'bg'),to:pick(bg.to,ROLES,'gradTo'),angle:Number.isFinite(bg.angle)?bg.angle:135},elements}
 }
 return {version:1,theme:pick(raw.theme,['studio','atmospheric','vibrant','technical'],'studio'),spacing:pick(raw.spacing,['compact','balanced','generous'],'compact'),highlight:pick(raw.highlight,['none','underline','color','background','font','gradient_text','gradient_background','boxed_gradient_text'],'none'),complementary:raw.complementary===true,imagery:{style:pick(raw.imagery?.style,['photograph','drawing'],'photograph'),subject:pick(raw.imagery?.subject,['person','object','scene','none'],'person'),placement:pick(raw.imagery?.placement,['cutout','background','framed','none'],'cutout'),brief:String(raw.imagery?.brief||'').slice(0,1200)},templates}
}
export function blueprintSpec(blueprint:any,slot:any,copy:any,index:number,total:number) {
 const chapter=index===0?'cover':index===total-1?'closing':'content'
 const template=blueprint.templates[chapter]
 return {...template,background:{...template.background,type:template.background.type==='image'&&blueprint.imagery.placement==='none'?'solid':template.background.type},elements:template.elements.filter((e:any)=>!(e.role && !copy[e.role]) && !(e.type==='image' && (blueprint.imagery.placement==='none'||!slot.resolvedAsset?.url))).map((e:any)=>({...e,assetId:e.type==='image'?slot.slot_id:undefined,image_variant:blueprint.imagery.placement==='cutout'?'subject':'photo'}))}
}
export function complementaryAccent(hex:string) {
 if(!/^#[0-9a-f]{6}$/i.test(hex))return hex
 const rgb=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)), high=Math.max(...rgb),low=Math.min(...rgb)
 return '#'+rgb.map(v=>(high+low-v).toString(16).padStart(2,'0')).join('')
}

export function isPlaceholderCopy(value:any) {
 return typeof value!=='string'||!value.trim()||/^(headline|title|body|description|text|sample( text)?|placeholder|your headline|your title|t[ií]tulo|descri[cç][aã]o)$/i.test(value.trim())
}
