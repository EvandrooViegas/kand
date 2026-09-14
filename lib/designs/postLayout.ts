import { blueprintSpec } from './brandBlueprint'
import { DESIGN_LIBRARY, librarySpec } from './library'

/** Transparent space around a cutout can hold copy without covering the subject. */
export function subjectOverlaps(subject:any,image:any,rect:any,gap=12){
 const overlaps=(a:any)=>a.x<rect.x+rect.width+gap&&a.x+a.width+gap>rect.x&&a.y<rect.y+rect.height+gap&&a.y+a.height+gap>rect.y
 if(!Array.isArray(subject?.silhouette)||!subject.silhouette.length)return overlaps(image)
 return subject.silhouette.some((band:any)=>overlaps({x:image.x+band.left*image.width,y:image.y+band.top*image.height,width:(band.right-band.left)*image.width,height:(band.bottom-band.top)*image.height}))
}

/** Compose each resolved cutout with its actual copy, rather than fitting a shared column. */
export function fitTextOnlySlide(spec:any,text:any,measure:any,typography?:any){
 const out={...spec,background:{...spec.background},elements:spec.elements.map((e:any)=>({...e}))}
 const title=out.elements.find((e:any)=>e.role==='headline'),body=out.elements.find((e:any)=>e.role==='body'),cta=out.elements.find((e:any)=>e.role==='cta')
 if(!title)return spec
 const candidates:any[]=[]
 const x=Math.max(72,Math.min(120,title.x||72)),y=Math.max(150,Math.min(240,title.y||150))
 const fit=(element:any,copy:string,width:number,height:number,size:number)=>{
  const padding=element.type==='badge'?24:0
  const fitted=measure({text:copy,width:width-padding,height:height-padding,preferredSize:size,minSize:element.role==='headline'?48:28,lineHeight:element.role==='headline'?1.08:1.3,minLineHeight:element.role==='headline'?1.08:1.3,spacing:element.letterSpacing||0,font:element.font||(element.role==='headline'?typography?.heading:typography?.body)})
  return {...fitted,height:fitted.height+padding+8}
 }
 for(const width of [760,840,1080-x-72])for(const headingSize of [96,112,128])for(const bodySize of [36,42,46])try{
  const headingFit=fit(title,text.headline||'',width,body&&text.body?320:650,body&&text.body?headingSize:160)
  const heading={x,y,width,height:headingFit.height,size:headingFit.fontSize,lineHeight:headingFit.lineHeight}
  const bodyWidth=Math.min(width,String(text.body||'').length>360?1080-x-72:780)
  const bodyY=y+heading.height+24
  const bodyFit=body&&text.body?fit(body,text.body,bodyWidth,960-bodyY-(cta&&text.cta?120:0),bodySize):null
  const paragraph=bodyFit?{x,y:bodyY,width:bodyWidth,height:bodyFit.height,size:bodyFit.fontSize,lineHeight:bodyFit.lineHeight}:null
  const end=paragraph?paragraph.y+paragraph.height:heading.y+heading.height
  const ctaFit=cta&&text.cta?fit(cta,text.cta,bodyWidth,100,30):null
  const footer=ctaFit?{x,y:end+28,width:bodyWidth,height:ctaFit.height,size:ctaFit.fontSize,lineHeight:ctaFit.lineHeight}:null
  if(end>960||footer&&footer.y+footer.height>1008)continue
  const target=String(text.body||'').length>300?850:700
  candidates.push({heading,paragraph,footer,end:footer?footer.y+footer.height:end,score:heading.size*2+(paragraph?.size||0)*3-Math.abs(end-target)*.04})
 }catch{}
 const chosen=candidates.sort((a,b)=>b.score-a.score)[0]
 if(!chosen)return spec
 Object.assign(title,chosen.heading)
 if(body&&chosen.paragraph)Object.assign(body,chosen.paragraph)
 if(cta&&chosen.footer)Object.assign(cta,chosen.footer)
 const circle=out.elements.find((e:any)=>e.type==='circle'||e.type==='ring')
 if(circle){
  const diameter=Math.max(320,Math.min(600,(1080-chosen.end)*1.4))
  const left=title.align==='right'
  Object.assign(circle,{x:left?0:1080-diameter,y:1080-diameter,width:diameter,height:diameter,layer:-6,opacity:Math.min(circle.opacity??12,12),shadow:false})
 }
 for(const line of out.elements.filter((e:any)=>e.type==='line'&&e.height<=8))Object.assign(line,{x,y:y-36,width:chosen.heading.width})
 out.elements=out.elements.filter((e:any)=>e.type!=='number')
 return out
}

export function fitResolvedSlide(spec:any,slot:any,text:any,measure:any,typography?:any) {
 if(!spec.elements.some((e:any)=>e.type==='image')&&spec.background.type!=='image')return fitTextOnlySlide(spec,text,measure,typography)
 const subject=slot?.resolvedAsset?.subject
 if(!subject?.width||!subject?.height)return spec
 const out={...spec,background:{...spec.background},elements:spec.elements.map((e:any)=>({...e}))}
 const image=out.elements.find((e:any)=>e.type==='image'),title=out.elements.find((e:any)=>e.role==='headline'),body=out.elements.find((e:any)=>e.role==='body')
 if(!image||!title)return spec
 const ratio=subject.width/subject.height
 const fit=(element:any,copy:string,width:number,height:number)=>{
  const padding=element.type==='badge'?24:0
  const result=measure({text:copy,width:width-padding,height:height-padding,preferredSize:element.size|| (element.role==='headline'?76:30),minSize:element.role==='headline'?40:24,lineHeight:element.role==='headline'?1.08:1.3,minLineHeight:element.role==='headline'?1.08:1.3,spacing:element.letterSpacing||0,font:element.font||(element.role==='headline'?typography?.heading:typography?.body)})
  return {...result,height:result.height+padding+8}
 }
 const candidates:any[]=[]
 const overlaps=(a:any,b:any)=>a.x<b.x+b.width+20&&a.x+a.width+20>b.x&&a.y<b.y+b.height+20&&a.y+a.height+20>b.y
 const add=(heading:any,paragraph:any,frame:any)=>{
  const scale=frame.bleedBottom?frame.width/subject.width:Math.min(frame.width/subject.width,frame.height/subject.height)
  const visual={x:frame.x+(frame.width-subject.width*scale)*(frame.anchor==='left'?0:frame.anchor==='right'?1:.5),y:frame.bleedBottom?frame.y:1080-subject.height*scale,width:subject.width*scale,height:subject.height*scale,bleed_bottom:!!frame.bleedBottom}
  if(subject.cropEdges?.left&&visual.x>1||subject.cropEdges?.right&&visual.x+visual.width<1079)return
  if(subjectOverlaps(subject,visual,heading,20)||paragraph&&subjectOverlaps(subject,visual,paragraph,20))return
  const cta=out.elements.find((e:any)=>e.role==='cta')
  let footer
  if(cta&&text.cta){
   const reading=paragraph||heading
   try{
    const ctaFit=fit({...cta,role:'body'},text.cta,reading.width,100)
    footer={x:reading.x,y:reading.y+reading.height+24,width:reading.width,height:ctaFit.height,size:ctaFit.fontSize}
    if(footer.y+footer.height>1008||subjectOverlaps(subject,visual,footer,20))return
   }catch{return}
  }
  const typeArea=heading.width*heading.height+(paragraph?paragraph.width*paragraph.height:0)
  candidates.push({heading,paragraph,visual,footer,area:visual.width*visual.height+typeArea*.15})
 }
 // Optimize this slide's hierarchy and width, using the real silhouette to reclaim transparent space.
 for(const side of ['left','right'])for(const headingWidth of [720,840,936])for(const bodyWidth of [340,380,420])try{
  const headingFit=fit({...title,size:Math.max(88,Math.min(104,(title.size||76)+20))},text.headline||'',headingWidth,300)
  const heading={x:side==='right'?72:1080-72-headingWidth,y:130,width:headingWidth,height:headingFit.height,size:headingFit.fontSize,lineHeight:headingFit.lineHeight}
  const paragraphFit=body&&text.body?fit({...body,size:Math.max(30,body.size||30)},text.body,bodyWidth,420):null
  const paragraph=paragraphFit?{x:side==='right'?72:1080-72-bodyWidth,y:heading.y+heading.height+24,width:bodyWidth,height:paragraphFit.height,size:paragraphFit.fontSize,lineHeight:paragraphFit.lineHeight}:null
  for(const imageWidth of [620,700,780,860])add(heading,paragraph,{x:side==='left'?0:1080-imageWidth,width:imageWidth,height:1080-heading.y-heading.height-24,anchor:side})
 }catch{}
 // Portraits can lead on either side, with body copy immediately below the headline on the other side.
 for(const side of ['left','right'])try{
  const headingFit=fit(title,text.headline||'',936,280)
  const heading={x:72,y:Math.max(130,Math.min(170,title.y||130)),width:936,height:headingFit.height,size:headingFit.fontSize,lineHeight:headingFit.lineHeight}
  const start=heading.y+heading.height+28
  const paragraphFit=body&&text.body?fit(body,text.body,460,380):null
  const paragraph=paragraphFit?{x:side==='left'?548:72,y:start,width:460,height:paragraphFit.height,size:paragraphFit.fontSize,lineHeight:paragraphFit.lineHeight}:null
  add(heading,paragraph,{x:side==='left'?0:564,width:516,height:1080-start,anchor:side})
 }catch{}
 // Wider assemblies (person + parcels, equipment, table) take a large lower stage.
 try{
  const headingFit=fit(title,text.headline||'',936,280)
  const heading={x:72,y:Math.max(130,Math.min(170,title.y||130)),width:936,height:headingFit.height,size:headingFit.fontSize,lineHeight:headingFit.lineHeight}
  const paragraphFit=body&&text.body?fit(body,text.body,Math.min(936,ratio>1.1?720:520),300):null
  const paragraph=paragraphFit?{x:72,y:heading.y+heading.height+24,width:ratio>1.1?720:520,height:paragraphFit.height,size:paragraphFit.fontSize,lineHeight:paragraphFit.lineHeight}:null
  let start=paragraph?paragraph.y+paragraph.height+24:heading.y+heading.height+24
  const cta=out.elements.find((e:any)=>e.role==='cta')
  if(cta&&text.cta)start+=fit({...cta,role:'body'},text.cta,(paragraph||heading).width,100).height+24
  add(heading,paragraph,{x:0,width:1080,height:1080-start,anchor:subject.cropEdges?.left?'left':subject.cropEdges?.right?'right':'center'})
  // Two cropped sides require full width. Let the lower image bleed beyond the canvas;
  // preserve its top, where faces usually are, instead of shrinking it away from either edge.
  if(subject.cropEdges?.left&&subject.cropEdges?.right&&start<900)add(heading,paragraph,{x:0,y:start,width:1080,height:1080-start,anchor:'left',bleedBottom:true})
 }catch{}
 const selected=candidates.sort((a,b)=>b.area-a.area)[0]
 if(!selected)return spec
 Object.assign(title,selected.heading)
 if(body&&selected.paragraph)Object.assign(body,selected.paragraph)
 Object.assign(image,selected.visual,{image_variant:'subject',assetId:slot.slot_id,radius:0,rotation:0,shadow:false})
 // The foreground owns the image stage; do not repeat its source as a backdrop or thumbnail.
 if(out.background.type==='image')out.background.type='solid'
 out.elements=out.elements.filter((e:any)=>e.type!=='image'||e===image)
 const cta=out.elements.find((e:any)=>e.role==='cta')
 if(cta&&selected.footer)Object.assign(cta,selected.footer)
 return out
}

export function arrangeReadableBody(spec:any,body:string) {
 const out={...spec,background:{...spec.background},elements:spec.elements.map((e:any)=>({...e}))}
 const paragraph=out.elements.find((e:any)=>e.role==='body'),title=out.elements.find((e:any)=>e.role==='headline')
 if(!title)return out
 if(String(body||'').length<240){
  const image=out.elements.find((e:any)=>e.type==='image')
  if(!image||out.background.type==='image')return out
  if(image.y+image.height<=title.y+32){
   // Full-width image stage above copy: contain the whole subject rather than cropping its face.
   Object.assign(image,{x:0,y:0,width:1080,height:Math.max(360,Math.min(650,title.y-32))})
  }else if(title.width>=700&&title.y+title.height<=image.y+32){
   Object.assign(image,{x:0,y:title.y+title.height+24,width:1080,height:1080-title.y-title.height-24})
  }else{
   const leftCopy=title.x<500
   Object.assign(title,{x:leftCopy?title.x:588,width:420,height:Math.min(title.height,340)})
   if(paragraph)Object.assign(paragraph,{x:leftCopy?paragraph.x:588,width:420,height:Math.min(paragraph.height,400)})
   Object.assign(image,{x:leftCopy?520:0,y:300,width:560,height:780})
   const cta=out.elements.find((e:any)=>e.role==='cta')
   if(cta)Object.assign(cta,{x:leftCopy?72:588,y:956,width:420,height:64})
  }
  return out
 }
 if(!paragraph)return out
 // Reading-heavy slides deliberately have no image; decide before requesting assets.
 const dense=String(body).trim().split(/\s+/).length>=55||String(body).length>=360
 if(dense){out.background.type='solid';out.elements=out.elements.filter((e:any)=>e.type!=='image'&&e.type!=='gradient'&&e.type!=='glow')}
 if(!dense&&out.background.type==='image')return out
 const image=out.elements.find((e:any)=>e.type==='image')
 Object.assign(title,{x:72,y:130,width:936,height:270})
 Object.assign(paragraph,{x:72,y:440,width:image?420:936,height:470,size:30,minSize:22,lineHeight:1.3})
 if(image){
  Object.assign(image,{x:520,y:410,width:560,height:670})
  const cta=out.elements.find((e:any)=>e.role==='cta')
  if(cta)Object.assign(cta,{x:72,y:956,width:420,height:64})
 }
 // Keep oversized ornamental numerals out of the reading area.
 out.elements=out.elements.filter((e:any)=>e.type!=='number')
 return out
}

/** Resolve a post's composition before any asset search or generation. */
export function planPostLayout(brand:any,copy:any,idea:any,designId?:string) {
 const saved=brand?.designs||[]
 const selected=saved.find((d:any)=>d.id===designId)||saved[Math.floor(Math.random()*saved.length)]
 const family=DESIGN_LIBRARY.find(d=>d.id===(selected?.baseId||designId))||DESIGN_LIBRARY[Math.floor(Math.random()*DESIGN_LIBRARY.length)]
 const slides=Array.isArray(copy.slides)&&copy.slides.length?copy.slides:[copy]
 const format=copy.format||idea?.format||'single'
 const slots=slides.map((slide:any,index:number)=>{
  const text={headline:slide.headline||slide.title||'',body:slide.body||slide.supportingText||'',cta:slide.cta||copy.cta||'',eyebrow:''}
  if(slides.length>1&&index===0)text.body=''
  const slot_id=slides.length>1?'slide_'+(index+1):'single_main'
  const placeholder={slot_id,resolvedAsset:{url:'placeholder'}}
  let spec=selected?.blueprint?blueprintSpec(selected.blueprint,placeholder,text,index,slides.length):librarySpec(family,placeholder,text,index,slides.length,selected?.artDirection)
  spec=arrangeReadableBody(spec,text.body)
  const image=spec.elements.find((e:any)=>e.type==='image')
  const dense=text.body.trim().split(/\s+/).length>=55||text.body.length>=360
  const background=!dense&&(spec.background.type==='image'||selected?.blueprint?.imagery?.placement==='background')
  if(background){spec.background={...spec.background,type:'image'};spec.elements=spec.elements.filter((e:any)=>e.type!=='image');spec.elements.unshift({type:'gradient',x:0,y:0,width:1080,height:1080,color:'bg',to:'bg',opacity:78,endOpacity:32,angle:90,layer:-10})}
  const frame=background?{x:0,y:0,width:1080,height:1080}:image?{x:image.x,y:image.y,width:image.width,height:image.height}:null
  return {slot_id,spec,frame,background,needs_visual:!!frame,treatment:background?'environmental':selected?.blueprint?.imagery?.placement==='framed'?'environmental':'isolated_subject',brief:frame?`Image placement: ${background?'full background':'foreground frame'} at x=${frame.x}, y=${frame.y}, width=${frame.width}, height=${frame.height} on a 1080px square. Aspect ratio ${(frame.width/frame.height).toFixed(2)}. Keep the complete subject inside this frame with generous edge clearance. ${background?'Keep the scene and background intact; leave quiet space behind text.':'No cropped heads, hands or essential props.'}`:''}
 })
 return {version:1,designId:selected?.id||family.id,format,slots}
}

/** Fit the resolved asset inside its planned frame; renderer subsequently fits actual copy. */
export function fitPlannedLayout(layout:any,slot:any) {
 const subject=slot.resolvedAsset?.subject
 const spec={...layout.spec,background:{...layout.spec.background},elements:layout.spec.elements.map((e:any)=>({...e}))}
 if(layout.background&&slot.resolvedAsset?.url) {
  // Without a verified face/negative-space map, separate copy from the scene.
  spec.background.type='solid'
  spec.elements=spec.elements.filter((e:any)=>e.role)
  const hasBody=spec.elements.some((e:any)=>e.role==='body')
  for(const e of spec.elements) {
   if(e.role==='headline')Object.assign(e,{x:72,y:hasBody?620:700,width:936,height:hasBody?170:230})
   if(e.role==='body')Object.assign(e,{x:72,y:814,width:936,height:130})
   if(e.role==='cta')Object.assign(e,{x:72,y:970,width:680,height:54})
  }
  spec.elements.unshift({type:'image',x:72,y:100,width:936,height:hasBody?480:540,assetId:slot.slot_id,image_variant:'photo',radius:16,layer:1})
 }
 spec.elements=spec.elements.filter((e:any)=>e.type!=='image'||slot.resolvedAsset?.url).map((e:any)=>{
  if(e.type!=='image')return e
  const out={...e,assetId:slot.slot_id,image_variant:slot.treatment==='environmental'?'photo':subject?'subject':'photo'}
  const source=slot.treatment==='environmental'?slot.resolvedAsset:subject||slot.resolvedAsset
  if(source?.width&&source?.height){const scale=Math.min(e.width/source.width,e.height/source.height);out.width=source.width*scale;out.height=source.height*scale;out.x=e.x+(e.width-out.width)/2;out.y=e.y+(e.height-out.height)*(subject&&slot.treatment!=='environmental'?1:.5)}
  return out
 })
 if(layout.background&&!slot.resolvedAsset?.url)spec.background.type='solid'
 return spec
}
