'use client'
import {MockImage,MockLogo} from '@/components/DesignMockAssets'
import {blueprintSpec,complementaryAccent} from '@/lib/designs/brandBlueprint'
import {useState,useId,useEffect} from 'react'
import {PALETTE_PICKS,paletteColors,constrainBrandPalette} from '@/lib/designs/palettes'
import {Search,Check,ArrowRight,Loader2,Plus} from 'lucide-react'
import {generateBrandBatch} from '@/lib/designs/generateBrandBatch'
import {Tabs,TabsList,TabsTrigger,TabsContent} from '@/components/ui/tabs'
import {DESIGN_LIBRARY,librarySpec} from '@/lib/designs/library'
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog'
import {Button} from '@/components/ui/button'

function samplePalette(canvas, theme, pick = 'brand') {
  const normalize = value => {
    if (typeof value !== 'string') return null
    const hex = value.trim()
    if (/^#[0-9a-f]{6}$/i.test(hex)) return hex
    if (/^#[0-9a-f]{3}$/i.test(hex)) return '#'+hex.slice(1).split('').map(c=>c+c).join('')
    return null
  }
  const brand = canvas?.designInput?.brandContext ?? canvas?.brandContext
  const nodes = canvas?.pages?.flatMap(p=>p.nodes||[]) || canvas?.nodes || []
  const supplied = (Array.isArray(brand?.colors)?brand.colors:[]).map(normalize).filter(Boolean)
  const recovered = nodes.flatMap(n=>[n.fill,n.color,...(n.stops||[]).map(s=>s.color)]).map(normalize).filter(Boolean)
  const colors = supplied.length ? supplied : [...new Set(recovered.filter(c=>!['#ffffff','#000000'].includes(c.toLowerCase())))]
  theme = PALETTE_PICKS.find(p=>p.id===pick)?.theme || theme
  const ordered = paletteColors(colors,pick)
  const primary = ordered[0] || normalize(canvas?.background) || '#53616b'
  const mix = (a,b,t) => '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-t)+parseInt(b.slice(i,i+2),16)*t).toString(16).padStart(2,'0')).join('')
  const accent = ordered[1] || mix(primary,'#ffffff',.4)
  const bg = theme==='studio'?mix(primary,'#ffffff',.96):theme==='vibrant'?primary:mix(primary,'#000000',.88)
  const luminance = [1,3,5].map(i=>parseInt(bg.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)
  return {primary,accent,bg,gradFrom:bg,gradTo:mix(bg,accent,.24),mutedText:luminance>.179?'#364036':'#dddeda',surface:theme==='studio'?'#ffffff':mix(bg,primary,.22),text:luminance>.179?'#101510':'#fafaf7',highlight:mix(accent,'#ffffff',.65),shade:mix(primary,'#000000',.4)}
}

// Local sample content: browsing never generates or changes a saved canvas.
export function Sample({design,chapter=0,canvas,pick='brand'}) {
  const uid=useId().replace(/:/g,'')
  let palette=samplePalette(canvas,design.blueprint?.theme||design.theme,pick)
  const brand=canvas?.designInput?.brandContext || canvas?.brandContext || {}
  const copy={headline:['Ideas that move you.','Make room for more.','Your next chapter.'][chapter],body:'A fresh perspective. Thoughtful details. Built around your brand.',cta:'Discover more',eyebrow:'STUDIO / 0'+(chapter+1)}
  copy.headline=['Lorem ipsum dolor sit amet.','Lorem ipsum, consectetur adipiscing.','Lorem ipsum. Your next chapter.'][chapter]
  copy.body='Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.'
  copy.eyebrow='BRAND / 0'+(chapter+1)
  if(chapter===0) copy.body=''
  if(design.blueprint)palette=constrainBrandPalette(palette,paletteColors(brand.colors||[],pick))
  const spec=design.blueprint ? blueprintSpec(design.blueprint,{slot_id:'sample',resolvedAsset:{url:'sample'}},copy,chapter,3) : librarySpec(DESIGN_LIBRARY.find(d=>d.id===(design.baseId||design.id)) || design,{slot_id:'sample',resolvedAsset:{url:'sample'}},copy,chapter,3,design.artDirection)
  const highlightText=(text,role)=>{
    const kind=design.blueprint?.highlight
    if(role!=='headline'||!kind||kind==='none'||chapter===1)return text
    const words=String(text||'').split(' '), phrase=words.splice(-Math.min(2,words.length)).join(' ')
    const styles={underline:{textDecoration:'underline',textDecorationColor:palette.accent},color:{color:palette.accent},background:{background:palette.primary,color:palette.text},font:{fontStyle:'italic'},gradient_text:{backgroundImage:'linear-gradient(110deg, '+palette.accent+', '+palette.primary+')',backgroundClip:'text',color:'transparent'},gradient_background:{backgroundImage:'linear-gradient(110deg, '+palette.primary+', '+palette.accent+')'}}
    if(kind==='boxed_gradient_text')return text
    return <>{words.join(' ')}{words.length?' ':''}<span style={styles[kind]}>{phrase}</span></>
  }
  const textStyle=e=>{
    const heading=e.role==='headline',fonts=brand.fonts||[]
    const font=fonts[heading?0:1]||fonts[0]
    const lineHeight=e.lineHeight||(heading?1.08:1.35)
    let size=e.size||(heading?86:30)
    const words=String(copy[e.role]||'').split(/\s+/)
    const availableWidth=e.width-(e.type==='badge'?40:0),availableHeight=e.height-(e.type==='badge'?24:0)
    // Fit fixed mock copy inside the authored box without altering its geometry.
    const fits=s=>{let lines=1,line=0;for(const word of words){const width=word.length*s*.56;if(width>availableWidth)return false;if(line&&line+width+s*.28>availableWidth){lines++;line=0}line+=width+s*.28}return lines*s*lineHeight<=availableHeight}
    while(size>18&&!fits(size))size--
    return {fontFamily:(typeof font==='string'?font:font?.family||font?.name)||'Arial,sans-serif',fontSize:size,fontWeight:e.weight||(heading?750:400),lineHeight,letterSpacing:e.letterSpacing||0,textShadow:e.shadow?'0 3px 14px #00000040':undefined,color:palette[e.color]||palette.text,textAlign:e.align||'left',padding:e.type==='badge'?'12px 20px':0,background:e.type==='badge'?palette[e.fill]||palette.primary:undefined,borderRadius:e.radius||24,boxSizing:'border-box',opacity:(e.opacity??100)/100}
  }
  return <svg viewBox="0 0 1080 1080" className="block w-full h-auto" aria-label={design.name+' sample slide '+(chapter+1)} role="img">
    <defs><linearGradient id={uid+'bg'} gradientTransform={'rotate('+((spec.background.angle??135)-90)+' .5 .5)'}><stop stopColor={palette[spec.background.color]||palette.bg}/><stop offset="1" stopColor={palette[spec.background.to]||palette.accent}/></linearGradient><radialGradient id={uid+'radial'}><stop stopColor={palette[spec.background.to]||palette.accent}/><stop offset="1" stopColor={palette[spec.background.color]||palette.bg}/></radialGradient></defs>
    <rect width="1080" height="1080" fill={spec.background.type==='radial'?'url(#'+uid+'radial)':spec.background.type==='gradient'?'url(#'+uid+'bg)':palette[spec.background.color]||palette.bg}/>
    {spec.background.type==='image'&&<MockImage width={1080} height={1080} palette={palette} uid={uid+'background'}/>}
    {[...spec.elements].sort((a,b)=>((a.type==='text'||a.type==='badge')?100:a.layer||0)-((b.type==='text'||b.type==='badge')?100:b.layer||0)).map((e,i)=>{
      const fill=palette[e.fill||e.color]||palette.primary
      const stroke=palette[e.color]||fill
      const opacity=(e.opacity??100)/100
      if(e.type==='text'||e.type==='badge') return <foreignObject key={i} x={e.x} y={e.y} width={e.width} height={e.height}><div xmlns="http://www.w3.org/1999/xhtml" style={textStyle(e)}>{highlightText(copy[e.role],e.role)}</div></foreignObject>
      if(e.type==='image')return <g key={i} opacity={opacity}><defs><clipPath id={uid+'clip'+i}>{e.mask==='circle'?<ellipse cx={e.x+e.width/2} cy={e.y+e.height/2} rx={e.width/2} ry={e.height/2}/>:<rect x={e.x} y={e.y} width={e.width} height={e.height} rx={e.mask==='pill'?Math.min(e.width,e.height)/2:e.radius||0}/>}</clipPath></defs><g clipPath={'url(#'+uid+'clip'+i+')'} style={{filter:e.shadow?'drop-shadow(0 12px 20px #00000030)':undefined}}><MockImage x={e.x} y={e.y} width={e.width} height={e.height} palette={palette} cutout={e.image_variant==='subject'||design.blueprint?.imagery?.placement==='cutout'} drawing={design.blueprint?.imagery?.style==='drawing'} uid={uid+'image'+i}/>{e.treatment==='darken'&&<rect x={e.x} y={e.y} width={e.width} height={e.height} fill="#000" opacity=".35"/>}</g></g>
      if(e.type==='glow'||e.type==='gradient')return <g key={i}><defs>{e.type==='glow'?<radialGradient id={uid+'layer'+i}><stop stopColor={stroke}/><stop offset="1" stopColor={stroke} stopOpacity="0"/></radialGradient>:<linearGradient id={uid+'layer'+i} gradientTransform={'rotate('+((e.angle??135)-90)+' .5 .5)'}><stop stopColor={stroke} stopOpacity={opacity}/><stop offset="1" stopColor={palette[e.to]||palette.accent} stopOpacity={(e.endOpacity??100)/100}/></linearGradient>}</defs><rect x={e.x} y={e.y} width={e.width} height={e.height} fill={'url(#'+uid+'layer'+i+')'} opacity={e.type==='glow'?opacity:1}/></g>
      if(e.type==='grid')return <g key={i} opacity={opacity}>{Array.from({length:14},(_,j)=><path key={j} d={'M '+(e.x+j*e.width/13)+' '+e.y+' V '+(e.y+e.height)+' M '+e.x+' '+(e.y+j*e.height/13)+' H '+(e.x+e.width)} stroke={stroke} strokeWidth={e.stroke||2}/>)}</g>
      if(e.type==='dots')return <g key={i} fill={stroke} opacity={opacity}>{Array.from({length:64},(_,j)=><circle key={j} cx={e.x+(j%8+.5)*e.width/8} cy={e.y+(Math.floor(j/8)+.5)*e.height/8} r={e.stroke||3}/>)}</g>
      if(e.type==='number')return <text key={i} x={e.x} y={e.y+e.height*.8} fontFamily="Arial,sans-serif" fontWeight="800" fontSize={e.size||240} fill={stroke} opacity={opacity}>0{chapter+1}</text>
      const transform=e.rotation?'rotate('+e.rotation+' '+(e.x+e.width/2)+' '+(e.y+e.height/2)+')':undefined
      if(e.type==='circle'||e.type==='ring')return <ellipse key={i} cx={e.x+e.width/2} cy={e.y+e.height/2} rx={e.width/2} ry={e.height/2} fill={e.type==='ring'?'none':fill} stroke={stroke} strokeWidth={e.stroke||2} opacity={opacity} transform={transform}/>
      return <rect key={i} x={e.x} y={e.y} width={e.width} height={e.height} rx={e.type==='pill'?Math.min(e.width,e.height)/2:e.radius||0} fill={e.type==='frame'?'none':fill} stroke={stroke} strokeWidth={e.stroke||0} transform={transform} style={{filter:e.shadow?'drop-shadow(0px 12px 20px #00000030)':undefined}} opacity={opacity}/>
    })}
    <g transform="translate(818 986) scale(.8)"><MockLogo palette={palette}/></g>
  </svg>
}

export default function DesignLibrary({canvas,selected,onSelect,disabled}) {
  const [savedBrand,setSavedBrand]=useState(null)
  const brand=canvas?.designInput?.brandContext || canvas?.brandContext
  useEffect(()=>{if(!brand?.id)return;let cancelled=false;fetch('/api/flows/'+brand.id).then(r=>r.ok?r.json():null).then(flow=>{if(!cancelled&&flow?.brandContext)setSavedBrand({...flow.brandContext,id:flow.id})}).catch(()=>{});return()=>{cancelled=true}},[brand?.id])
  const brandDesigns=(savedBrand?.designs || brand?.designs || []).map(p=>({...DESIGN_LIBRARY.find(d=>d.id===p.baseId),...p}))
  const choices=[...brandDesigns,...DESIGN_LIBRARY]
  if(savedBrand) canvas={...canvas,designInput:{...canvas?.designInput,brandContext:savedBrand}}

  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(DESIGN_LIBRARY[0].id)
  const [pick,setPick]=useState(selected?.paletteId||'brand')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[chapter,setChapter]=useState(0)
  const [tab,setTab]=useState('premade'),[creating,setCreating]=useState(false),[progress,setProgress]=useState('')
  const design=choices.find(d=>d.id===active)
  const filtered=(tab==='brand'?brandDesigns:DESIGN_LIBRARY).filter(d=>(d.name+' '+(d.tags||[]).join(' ')).toLowerCase().includes(query.toLowerCase()))
  const switchTab=value=>{setTab(value);setQuery('');setError('');const list=value==='brand'?brandDesigns:DESIGN_LIBRARY;if(!list.some(d=>d.id===active)){setActive(list[0]?.id||'');if(list[0]?.paletteId)setPick(list[0].paletteId)}setChapter(0)}
  return <><Button variant="outline" size="sm" disabled={disabled} onClick={()=>{const chosen=choices.find(d=>d.id===selected?.id);setTab(brandDesigns.some(d=>d.id===selected?.id)||selected?.id?.startsWith('brand-')?'brand':'premade');setActive(chosen?.id||(selected?.id?.startsWith('brand-')?selected.id:DESIGN_LIBRARY[0].id));setPick(selected?.paletteId||'brand');setQuery('');setError('');setChapter(0);setOpen(true)}}>Design: {selected?.name||'Custom'}</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy&&!creating)setOpen(v)}}><DialogContent className="w-[calc(100vw-1rem)] max-w-7xl h-[94dvh] max-h-[1040px] p-0 flex flex-col gap-0 overflow-hidden">
      <DialogHeader className="px-6 py-5 border-b text-left shrink-0"><DialogTitle className="text-xl">Find your look</DialogTitle><DialogDescription>Brand identities and premade designs. Every slide gets its own composition.</DialogDescription></DialogHeader>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1fr_1.15fr] overflow-y-auto md:overflow-hidden">
        <div className="min-w-0 p-4 md:p-5 md:overflow-y-auto border-b md:border-b-0 md:border-r"><div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input aria-label="Search designs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a name or mood…" className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm"/></div>
          <Tabs value={tab} onValueChange={switchTab}><TabsList className="w-full h-11 mb-3"><TabsTrigger disabled={creating||busy} value="brand" className="flex-1">Brand designs ({brandDesigns.length})</TabsTrigger><TabsTrigger disabled={creating||busy} value="premade" className="flex-1">Premade designs</TabsTrigger></TabsList>
          <TabsContent value={tab}>
          {tab==='brand'&&<div className="mb-4"><Button className="w-full" variant="outline" disabled={creating||busy||!brand?.id||!brand?.name} onClick={async()=>{setCreating(true);setError('');try{await generateBrandBatch({flowId:brand.id,brand:savedBrand||brand,onProgress:setProgress,onSaved:next=>{setSavedBrand(next);const newest=next.designs?.at(-1);if(newest){setActive(newest.id);setPick(newest.paletteId||'brand');setQuery('');setChapter(0)}}})}catch(e){setError(e.message||'Could not create design')}finally{setCreating(false);setProgress('')}}}>{creating?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Plus className="mr-2 h-4 w-4"/>}{creating?'Creating design…':'Create a brand design'}</Button>{creating&&<p role="status" className="text-xs mt-2 text-muted-foreground">{progress}</p>}{!brand?.id&&<p className="text-xs mt-2 text-muted-foreground">Save your brand to create a design.</p>}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{filtered.map(d=><button key={d.id} disabled={busy||creating} aria-pressed={active===d.id} onClick={()=>{setActive(d.id);if(d.paletteId)setPick(d.paletteId);setChapter(0);setError('')}} className={'text-left rounded-xl border-2 overflow-hidden transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary '+(active===d.id?'border-primary ring-2 ring-primary/15':'border-border bg-background hover:border-primary/50')}><div className="relative"><Sample design={d} canvas={canvas} pick={active===d.id?pick:d.paletteId||'brand'}/>{selected?.id===d.id&&<span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-background px-2 py-1 text-[10px] font-semibold shadow"><Check size={11}/>Current</span>}</div><div className="p-3"><span className="block text-sm font-semibold">{d.name}</span><span className="text-xs text-muted-foreground">{(d.tags||[]).slice(0,2).join(' · ')}</span></div></button>)}</div>
          {!filtered.length&&<p className="py-10 text-center text-sm text-muted-foreground">{query?'No matching designs.':tab==='brand'?'Create your first design using your brand’s colors and fonts.':'No designs available.'}</p>}
          </TabsContent></Tabs>
        </div>
        {design?<section aria-label="Sample preview" className="min-w-0 bg-muted/30 p-5 md:overflow-y-auto"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">{design.name}</h3><span className="text-xs text-muted-foreground">Brand palette · Sample preview</span></div><div className="max-w-[520px] w-full mx-auto rounded-xl overflow-hidden shadow-lg ring-1 ring-border"><Sample design={design} chapter={chapter} canvas={canvas} pick={pick}/></div><div className="grid grid-cols-3 gap-3 max-w-[360px] mx-auto my-4">{['Cover','Content','Closing'].map((label,i)=><button key={label} onClick={()=>setChapter(i)} aria-pressed={chapter===i} className={'overflow-hidden rounded-lg border-2 text-xs '+(chapter===i?'border-primary text-foreground':'border-transparent text-muted-foreground hover:border-border')}><Sample design={design} chapter={i} canvas={canvas} pick={pick}/><span className="block py-1.5">{label}</span></button>)}</div><div className="flex justify-center flex-wrap gap-2">{(design.tags||[]).map(tag=><span key={tag} className="text-xs border rounded-full px-2.5 py-1">{tag}</span>)}</div><p className="text-xs text-muted-foreground text-center mt-4">Sample content for instant browsing. Applying uses your post’s saved content and brand.</p></section>:<section className="flex min-h-[360px] items-center justify-center bg-muted/30 p-8 text-center text-muted-foreground"><p>Select or create a brand design to preview its layout here.</p></section>}
      </div>
      <footer className="shrink-0 border-t p-4 flex items-center justify-between gap-3 bg-background"><div className="min-w-0"><p className="text-sm">Current: <strong>{selected?.name||'Custom design'}</strong></p><p className="text-xs text-muted-foreground">Applies to all slides and replaces manual layout edits.</p>{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}</div><Button disabled={busy||creating||!design} onClick={async()=>{setBusy(true);setError('');try{await onSelect(active);setOpen(false)}catch(e){setError(e.message||'Could not apply design')}finally{setBusy(false)}}}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<ArrowRight className="mr-2 h-4 w-4"/>}{busy?'Applying…':design?'Use '+design.name:'Select a design'}</Button></footer>
    </DialogContent></Dialog></>
}
