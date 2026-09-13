export const DESIGN_LIBRARY = [
  { id:'editorial', name:'Editorial', tags:['modern','elegant','smart'], theme:'studio', layout:[72,170,470,300,72,540,450,320,590,170,420,700], motif:'line' },
  { id:'spotlight', name:'Spotlight', tags:['premium','dramatic','innovation'], theme:'atmospheric', layout:[72,140,936,230,72,430,390,350,510,420,500,470], motif:'glow' },
  { id:'blueprint', name:'Blueprint', tags:['smart','technical','innovation'], theme:'technical', layout:[570,180,440,310,570,560,440,300,72,200,430,650], motif:'grid' },
  { id:'orbit', name:'Orbit', tags:['futuristic','modern','dynamic'], theme:'atmospheric', layout:[100,160,880,220,100,720,880,170,290,410,500,270], motif:'ring' },
  { id:'colorblock', name:'Color Block', tags:['bold','playful','modern'], theme:'vibrant', layout:[72,160,936,260,560,550,450,320,72,500,430,390], motif:'shape' },
  { id:'gallery', name:'Gallery', tags:['minimal','artistic','elegant'], theme:'studio', layout:[72,600,936,200,72,830,936,100,220,150,640,390], motif:'frame' },
  { id:'botanical', name:'Botanical', tags:['organic','exotic','calm'], theme:'studio', layout:[72,180,480,320,72,560,440,310,600,250,410,600], motif:'circle' },
  { id:'poster', name:'Manifesto', tags:['bold','expressive','exotic'], theme:'vibrant', layout:[72,160,936,320,72,560,570,300,700,570,300,290], motif:'number' },
  { id:'collage', name:'Collage', tags:['creative','exotic','playful'], theme:'studio', layout:[480,150,530,290,480,520,510,350,60,270,360,550], motif:'card' },
  { id:'panorama', name:'Panorama', tags:['cinematic','confident','modern'], theme:'atmospheric', layout:[72,140,936,230,72,420,936,160,72,620,936,290], motif:'gradient' },
] as const

/** Shared visual language, different compositions for each chapter of a carousel. */
export function librarySpec(design: typeof DESIGN_LIBRARY[number], slot: any, copy: any, index = 0, total = 1, art: any = null) {
  const family = DESIGN_LIBRARY.findIndex(d => d.id === design.id)
  const closing = total > 1 && index === total - 1
  const chapter = index === 0 ? 0 : closing ? 4 : 1 + (index - 1) % 3
  let b: readonly number[] = design.layout
  if (chapter === 1) {
    // Reverse the visual weight while retaining this family's proportions.
    b = design.layout.map((value,i) => i % 4 === 0 ? 1080 - value - design.layout[i+2] : value)
  } else if (chapter === 2) {
    b = family % 2 === 0
      ? [72,570,936,220,72,830,880,100,180,150,720,370]
      : [72,150,936,240,72,450,420,400,560,450,450,450]
  } else if (chapter === 3) {
    b = family % 2 === 0
      ? [570,160,440,320,570,550,440,340,72,180,430,700]
      : [72,170,450,320,72,550,450,340,580,160,430,720]
  } else if (chapter === 4) {
    b = family % 2 === 0
      ? [72,150,936,290,72,540,560,330,700,540,310,350]
      : [72,530,936,240,72,810,900,110,300,140,480,330]
  }
  if (slot.resolvedAsset?.subject) {
    const wide = slot.resolvedAsset.subject.width / slot.resolvedAsset.subject.height > 1.25
    if (wide) b = chapter % 2
      ? [72,630,936,180,72,840,936,100,100,140,880,440]
      : [72,140,936,210,72,380,936,130,90,540,900,380]
    else b = chapter % 3 === 0
      ? [72,130,936,180,750,420,260,450,40,340,680,600]
      : chapter % 3 === 1
        ? [72,130,936,180,72,420,280,450,400,340,640,600]
        : [72,145,936,210,72,800,936,120,220,385,640,380]
  }
  // A headline-only cover gives the focal image the full lower stage.
  if (index === 0 && !copy.body && slot.resolvedAsset?.url) b = [72,140,936,230,72,800,936,100,72,400,936,560]
  if (art) {
    const mirrored = chapter % 2 === 1
    if (art.composition === 'split') b = mirrored
      ? [570,150,440,290,570,520,420,350,40,180,480,720]
      : [72,150,440,290,72,520,420,350,560,180,480,720]
    if (art.composition === 'stage') b = chapter === 0
      ? [90,130,900,220,72,820,936,100,140,400,800,380]
      : [72,560,936,220,72,810,900,110,220,130,640,360]
    if (art.composition === 'diagonal') b = mirrored
      ? [72,130,936,220,72,440,300,420,440,400,570,500]
      : [72,130,936,220,730,440,280,420,50,400,610,500]
  }
  const numbered = /(?:^|[→\n])\s*\d+[.)]?\s+/.test(copy.body || '') && (String(copy.body).match(/(?:^|[→\n])\s*\d+[.)]?\s+/g)||[]).length > 1
  if (!slot.resolvedAsset?.url && index === 0) b = [72,175,936,340,72,630,820,230,780,760,220,160]
  const bulleted = splitBulletItems(copy.body).length > 1
  if (numbered || bulleted) b = [72,150,936,220,72,430,936,480,840,160,160,180]
  const box = (offset: number) => ({ x:b[offset], y:b[offset+1], width:b[offset+2], height:b[offset+3] })
  const elements: any[] = []
  const accent = chapter % 2 ? 'accent' : 'primary'
  const motif: any = { type:design.motif, x:40, y:120, width:1000, height:800, color:accent, opacity:18, radius:80, layer:-5 }
  if (design.motif === 'line') Object.assign(motif,{x:chapter%2?650:72,y:120,width:300,height:4,opacity:100})
  if (design.motif === 'card') Object.assign(motif,{...box(8),x:Math.max(12,b[8]-20),y:b[9]+14,rotation:chapter%2?6:-6,fill:accent,opacity:35})
  if (design.motif === 'shape') Object.assign(motif,{x:0,y:chapter%2?120:480,width:1080,height:chapter%2?300:440,opacity:35})
  if (design.motif === 'number') Object.assign(motif,{...box(8),size:260})
  if (slot.resolvedAsset?.subject && ['glow','gradient','circle'].includes(design.motif)) Object.assign(motif,{type:'glow',...box(8),radius:0,opacity:42})
  if (art) {
    motif.type = art.motif === 'ring' ? 'ring' : art.motif === 'beam' ? 'shape' : 'gradient'
    Object.assign(motif,{x:art.composition==='split'?480:40,y:chapter%2?220:100,width:art.composition==='split'?580:1000,height:850,opacity:art.motif==='beam'?32:18,rotation:art.motif==='beam'?-12:0})
    elements.push({type:'glow',x:chapter%2?0:480,y:80,width:580,height:650,color:'accent',opacity:art.lighting==='dramatic'?44:20,layer:-6})
  }
  if (!(index === 0 && motif.type === 'number')) elements.push(motif)
  const hasImage = !!slot.resolvedAsset?.url && !numbered && !bulleted
  const subject = !!slot.resolvedAsset?.subject
  if (hasImage) {
    let imageBox = box(8)
    let grounded = false
    if (subject) {
      const ratio = slot.resolvedAsset.subject.width / slot.resolvedAsset.subject.height
      const hasCopyBelow = !!copy.cta || b[5] >= imageBox.y + imageBox.height
      // Match the asset aspect ratio so contain cannot leave a floating base.
      const availableHeight = hasCopyBelow ? imageBox.height : 1080 - imageBox.y
      const height = Math.min(availableHeight, imageBox.width / ratio)
      const width = height * ratio
      imageBox = { x:imageBox.x + (imageBox.width-width)/2, y:hasCopyBelow ? imageBox.y : 1080-height, width, height }
      grounded = !hasCopyBelow
      elements.push({type:'glow',x:Math.max(0,imageBox.x-40),y:Math.max(0,imageBox.y-50),width:Math.min(1080,imageBox.width+80),height:imageBox.height,color:accent,opacity:chapter===0?30:16,layer:-3})
      elements.push({type:'ring',x:imageBox.x+imageBox.width*.1,y:imageBox.y+imageBox.height*.12,width:imageBox.width*.8,height:imageBox.height*.65,color:accent,stroke:3,opacity:24,layer:-2})
    }
    if (['spotlight','orbit','panorama','botanical'].includes(design.id)) {
      // Light sits behind the silhouette, never over its face or the copy.
      elements.push({type:'glow',...imageBox,color:accent,opacity:chapter===0?38:24,layer:-3})

    } else if (['gallery','collage','editorial'].includes(design.id)) {
      elements.push({type:'card',x:Math.max(0,imageBox.x-12),y:Math.max(0,imageBox.y-12),width:imageBox.width+24,height:imageBox.height+24,fill:accent,color:accent,opacity:22,radius:16,layer:-2})
    }
    if (art && !subject) {
      elements.push({type:'glow',x:imageBox.x+18,y:imageBox.y+32,width:imageBox.width,height:imageBox.height,color:'text',opacity:art.lighting==='dramatic'?22:10,layer:0})
      elements.push({type:'card',x:Math.max(0,imageBox.x-12),y:Math.max(0,imageBox.y-12),width:imageBox.width+24,height:imageBox.height+24,fill:'surface',color:'surface',opacity:100,radius:20,layer:1})
    }
    elements.push({type:'image',assetId:slot.slot_id,image_variant:subject?'subject':'photo',...imageBox,radius:subject?0:design.id==='orbit'?140:12,treatment:'natural',layer:2})
    if (subject && !grounded) {
      // A deliberate foreground ledge hides the waist crop on upper-stage portraits.
      elements.push({type:'card',x:Math.max(0,imageBox.x-20),y:imageBox.y+imageBox.height-22,width:Math.min(1040,imageBox.width+40),height:30,fill:accent,color:accent,opacity:100,radius:0,layer:3})
    }
  } else if (design.motif !== 'number' && index !== 0 && !numbered && !bulleted) {
    // Give text-led chapters a focal graphic in the space reserved for imagery.
    elements.push({type:['blueprint','editorial','poster'].includes(design.id)?'number':'ring',...box(8),size:240,color:accent,opacity:22,stroke:8,layer:-1})
  }
  const size = art ? (chapter===0?96:chapter===2?82:70) : chapter===0 ? (design.id==='poster'?106:86) : closing ? 92 : chapter===2 ? 82 : chapter===3 ? 76 : 68
  elements.push({type:'text',role:'headline',...box(0),size,minSize:28,color:'text',align:chapter===4&&family%2?'center':'left',lineHeight:1.08})
  if (copy.body) elements.push({type:'text',role:'body',...box(4),size:chapter===2?28:chapter===3?34:30,minSize:18,color:'text'})
  if (copy.eyebrow) elements.push({type:'text',role:'eyebrow',x:72,y:66,width:650,height:44,size:22,color:'text'})
  if (copy.cta) elements.push({type:closing?'badge':'text',role:'cta',x:72,y:960,width:closing?Math.min(830,Math.max(300,String(copy.cta).length*16+48)):830,height:64,size:26,minSize:18,fill:'primary',color:'text',radius:24})
  const light = design.theme==='studio'
  return {slot_id:slot.slot_id, background:{type:light||design.theme==='vibrant'?'solid':'gradient',color:chapter===2?'surface':'bg',to:chapter%2?'gradTo':'surface',angle:chapter%2?45:135},elements}
}

/** Only explicit list markers; ordinary sentences and hyphenated words stay intact. */
export function splitBulletItems(text: string): string[] {
  const parts = String(text || '').split(/(?:^|\n)\s*[-*]\s+|[•●▪]\s*/)
  if (parts[0]?.trim()) return []
  const items = parts.slice(1).map(item=>item.trim()).filter(Boolean)
  return items.length >= 2 && items.length <= 6 ? items : []
}
