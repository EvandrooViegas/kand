'use client'
import {blueprintSpec,complementaryAccent,isPlaceholderCopy} from '@/lib/designs/brandBlueprint'
import {useState,useId,useEffect} from 'react'
import {PALETTE_PICKS,paletteColors} from '@/lib/designs/palettes'
import {Search,Check,ArrowRight,Loader2} from 'lucide-react'
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
  const light=design.theme==='studio'
  const palette=samplePalette(canvas,design.blueprint?.theme||design.theme,pick)
  const brand=canvas?.designInput?.brandContext || canvas?.brandContext || {}
  const copy={headline:['Ideas that move you.','Make room for more.','Your next chapter.'][chapter],body:'A fresh perspective. Thoughtful details. Built around your brand.',cta:'Discover more',eyebrow:'STUDIO / 0'+(chapter+1)}
  copy.headline=(!isPlaceholderCopy(design.headline)?design.headline:null) || (brand.name ? [brand.name, 'Made for you', 'Discover '+brand.name][chapter] : copy.headline)
  copy.body=(!isPlaceholderCopy(design.body)?design.body:null) || String(brand.about || copy.body).slice(0,150)
  copy.eyebrow=brand.name || copy.eyebrow
  if(chapter===0) copy.body=''
  if(design.blueprint?.complementary)palette.accent=complementaryAccent(palette.primary)
  const spec=design.blueprint ? blueprintSpec(design.blueprint,{slot_id:'sample',resolvedAsset:{url:'sample'}},copy,chapter,3) : librarySpec(DESIGN_LIBRARY.find(d=>d.id===(design.baseId||design.id)) || design,{slot_id:'sample',resolvedAsset:{url:'sample'}},copy,chapter,3,design.artDirection)
  const sampleImage=design.previewAsset?.url
  const sampleSubject=design.previewAsset?.subject?.url
  const isPortuguese=/^pt|portugu/i.test(brand.language||'')
  if(isPortuguese) {
    copy.cta='Saiba mais'
    if(isPlaceholderCopy(design.headline))copy.headline=[brand.name,'Conheça '+brand.name,'O próximo passo'][chapter]
  }
  const highlightText=(text,role)=>{
    const kind=design.blueprint?.highlight
    if(role!=='headline'||!kind||kind==='none'||chapter===1)return text
    const words=String(text||'').split(' '), phrase=words.splice(-Math.min(2,words.length)).join(' ')
    const styles={underline:{textDecoration:'underline',textDecorationColor:palette.accent},color:{color:palette.accent},background:{background:palette.primary,color:palette.text},font:{fontStyle:'italic'},gradient_text:{backgroundImage:'linear-gradient(110deg, '+palette.accent+', '+palette.primary+')',backgroundClip:'text',color:'transparent'},gradient_background:{backgroundImage:'linear-gradient(110deg, '+palette.primary+', '+palette.accent+')'}}
    if(kind==='boxed_gradient_text')return <>{words.join(' ')}{words.length?' ':''}<span style={{background:palette.primary}}><span style={styles.gradient_text}>{phrase}</span></span></>
    return <>{words.join(' ')}{words.length?' ':''}<span style={styles[kind]}>{phrase}</span></>
  }
  return <svg viewBox="0 0 1080 1080" className="block w-full h-auto" aria-label={design.name+' sample slide '+(chapter+1)} role="img">
    <defs><linearGradient id={uid+'bg'} x1="0" y1="0" x2="1" y2="1"><stop stopColor={palette[spec.background.color]||palette.bg}/><stop offset="1" stopColor={palette[spec.background.to]||palette.accent}/></linearGradient><radialGradient id={uid+'glow'}><stop stopColor={palette.primary}/><stop offset="1" stopColor={palette.primary} stopOpacity="0"/></radialGradient><linearGradient id={uid+'object'} x2="1" y2="1"><stop stopColor={palette.highlight}/><stop offset=".48" stopColor={palette.accent}/><stop offset="1" stopColor={palette.shade}/></linearGradient></defs>
    <rect width="1080" height="1080" fill={['gradient','radial'].includes(spec.background.type)?'url(#'+uid+'bg)':palette[spec.background.color]||palette.bg}/>
    {spec.background.type==='image'&&sampleImage?<image href={sampleImage} width="1080" height="1080" preserveAspectRatio="xMidYMid slice"/>:spec.background.type==='image'&&<g><rect width="1080" height="1080" fill={palette.shade}/><circle cx="780" cy="420" r="310" fill={palette.accent} opacity=".4"/><path d="M0 850 L600 290 L1080 720 V1080 H0Z" fill={palette.primary} opacity=".6"/></g>}
    {[...spec.elements].sort((a,b)=>((a.type==='text'||a.type==='badge')?100:a.layer||0)-((b.type==='text'||b.type==='badge')?100:b.layer||0)).map((e,i)=>{
      const fill=palette[e.color]||palette.primary
      if(e.type==='text'||e.type==='badge') return <foreignObject key={i} x={e.x} y={e.y} width={e.width} height={e.height}><div xmlns="http://www.w3.org/1999/xhtml" style={{fontFamily:(typeof brand.fonts?.[0]==='string'?brand.fonts[0]:brand.fonts?.[0]?.family)||'Arial,sans-serif',fontSize:e.role==='headline'?Math.max(64,e.size||86):e.size||30,fontWeight:e.weight || (e.role==='headline'?750:400),lineHeight:1.08,textShadow:e.shadow?'0 3px 14px #00000040':undefined,color:palette.text,textAlign:e.align||'left',padding:e.type==='badge'?'12px 20px':0,background:e.type==='badge'?palette.primary:undefined,borderRadius:24}}>{highlightText(copy[e.role],e.role)}</div></foreignObject>
      if(e.type==='image'&&sampleImage&&design.blueprint?.imagery?.style!=='drawing')return <image key={i} href={e.image_variant==='subject'&&sampleSubject?sampleSubject:sampleImage} x={e.x} y={e.y} width={e.width} height={e.height} preserveAspectRatio={e.image_variant==='subject'?'xMidYMax meet':'xMidYMid slice'}/>
      if(e.type==='image')return <g key={i} transform={'translate('+e.x+' '+e.y+')'}><rect width={e.width} height={e.height} rx="20" fill={palette.surface}/><ellipse cx={e.width*.5} cy={e.height*.8} rx={e.width*.3} ry={e.height*.04} fill="#000" opacity=".12"/><rect x={e.width*.23} y={e.height*.18} width={e.width*.54} height={e.height*.6} rx={Math.min(e.width,e.height)*.16} fill={design.blueprint?.imagery?.style==='drawing'?'none':'url(#'+uid+'object)'} stroke={palette.accent} strokeWidth={design.blueprint?.imagery?.style==='drawing'?8:0} transform={'rotate(-12 '+e.width/2+' '+e.height/2+')'}/><circle cx={e.width*.5} cy={e.height*.44} r={Math.min(e.width,e.height)*.14} fill="none" stroke={palette.highlight} strokeWidth="12" opacity=".8"/></g>
      if(e.type==='glow'||e.type==='gradient')return <g key={i}><defs><linearGradient id={uid+'layer'+i} gradientTransform={'rotate('+(e.angle||135)+' .5 .5)'}><stop stopColor={fill} stopOpacity={(e.opacity??100)/100}/><stop offset="1" stopColor={palette[e.to]||palette.accent} stopOpacity={(e.endOpacity??100)/100}/></linearGradient></defs><rect key={i} x={e.x} y={e.y} width={e.width} height={e.height} fill={'url(#'+(e.type==='glow'?uid+'glow':uid+'layer'+i)+')'} opacity={e.type==='glow'?(e.opacity||30)/100:1}/></g>
      if(e.type==='grid')return <g key={i} opacity=".12">{Array.from({length:14},(_,j)=><path key={j} d={'M '+(40+j*76)+' 120 V 920 M 40 '+(120+j*60)+' H 1040'} stroke={fill} strokeWidth="2"/>)}</g>
      if(e.type==='number')return <text key={i} x={e.x} y={e.y+e.height*.8} fontSize={e.size||240} fill={fill} opacity=".2">0{chapter+1}</text>
      return <rect key={i} x={e.x} y={e.y} width={e.width} height={e.height} rx={e.type==='ring'||e.type==='circle'?Math.min(e.width,e.height)/2:e.radius||0} fill={e.type==='ring'||e.type==='frame'?'none':fill} stroke={fill} strokeWidth={e.stroke||2} style={{filter:e.shadow?'drop-shadow(0px 12px 20px #00000030)':undefined}} opacity={(e.opacity??25)/100}/>
    })}
    {brand.logo && <image href={brand.logoVariants?.white?.url || brand.logo} x="904" y="972" width="104" height="54" preserveAspectRatio="xMidYMid meet"/>}
  </svg>
}

export default function DesignLibrary({canvas,selected,onSelect,disabled}) {
  const [savedBrand,setSavedBrand]=useState(null)
  const brand=canvas?.designInput?.brandContext || canvas?.brandContext
  useEffect(()=>{if(!brand?.id)return;let cancelled=false;fetch('/api/flows/'+brand.id).then(r=>r.ok?r.json():null).then(flow=>{if(!cancelled&&flow?.brandContext)setSavedBrand(flow.brandContext)}).catch(()=>{});return()=>{cancelled=true}},[brand?.id])
  const choices=[...(savedBrand?.designs || brand?.designs || []).map(p=>({...DESIGN_LIBRARY.find(d=>d.id===p.baseId),...p})),...DESIGN_LIBRARY]
  if(savedBrand) canvas={...canvas,designInput:{...canvas?.designInput,brandContext:savedBrand}}

  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[active,setActive]=useState(DESIGN_LIBRARY[0].id)
  const [pick,setPick]=useState(selected?.paletteId||'brand')
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[chapter,setChapter]=useState(0)
  const design=choices.find(d=>d.id===active)||DESIGN_LIBRARY[0]
  const filtered=choices.filter(d=>(d.name+' '+d.tags.join(' ')).toLowerCase().includes(query.toLowerCase()))
  return <><Button variant="outline" size="sm" disabled={disabled} onClick={()=>{setActive(selected?.id||DESIGN_LIBRARY[0].id);setPick(selected?.paletteId||'brand');setQuery('');setError('');setChapter(0);setOpen(true)}}>Design: {selected?.name||'Custom'}</Button>
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v)}}><DialogContent className="w-[calc(100vw-1rem)] max-w-6xl h-[90dvh] max-h-[900px] p-0 flex flex-col gap-0 overflow-hidden">
      <DialogHeader className="px-6 py-5 border-b text-left shrink-0"><DialogTitle className="text-xl">Find your look</DialogTitle><DialogDescription>Saved brand designs and design families. Your colors, fonts and content.</DialogDescription></DialogHeader>
      <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] overflow-y-auto md:overflow-hidden">
        <div className="min-w-0 p-4 md:p-5 md:overflow-y-auto border-b md:border-b-0 md:border-r"><div className="relative mb-4"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><input aria-label="Search designs" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search a name or mood…" className="w-full rounded-lg border bg-background pl-9 pr-3 py-2.5 text-sm"/></div>
          <div className="grid grid-cols-2 gap-3">{filtered.map(d=><button key={d.id} disabled={busy} aria-pressed={active===d.id} onClick={()=>{setActive(d.id);if(d.paletteId)setPick(d.paletteId);setError('')}} className={'text-left rounded-xl border-2 overflow-hidden transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary '+(active===d.id?'border-primary ring-2 ring-primary/15':'border-transparent bg-muted/40 hover:border-border')}><div className="relative"><Sample design={d} canvas={canvas} pick={pick}/>{selected?.id===d.id&&<span className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-background px-2 py-1 text-[10px] font-semibold shadow"><Check size={11}/>Current</span>}</div><div className="p-3"><span className="block text-sm font-semibold">{d.name}</span><span className="text-xs text-muted-foreground">{d.tags.slice(0,2).join(' · ')}</span></div></button>)}</div>
          {!filtered.length&&<p className="py-12 text-center text-sm text-muted-foreground">No designs match “{query}”. Try another mood.</p>}
        </div>
        <section aria-label="Sample preview" className="min-w-0 bg-muted/30 p-5 md:overflow-y-auto"><div className="flex justify-between items-center mb-3"><h3 className="font-semibold">{design.name}</h3><span className="text-xs text-muted-foreground">Brand palette · Sample preview</span></div><div className="max-w-[360px] mx-auto rounded-xl overflow-hidden shadow-lg"><Sample design={design} chapter={chapter} canvas={canvas} pick={pick}/></div><div className="flex justify-center gap-1 my-4">{['Cover','Content','Closing'].map((label,i)=><button key={label} onClick={()=>setChapter(i)} aria-pressed={chapter===i} className={'px-3 py-1.5 text-xs rounded-full '+(chapter===i?'bg-foreground text-background':'text-muted-foreground hover:bg-muted')}>{label}</button>)}</div><div className="flex justify-center flex-wrap gap-2">{design.tags.map(tag=><span key={tag} className="text-xs border rounded-full px-2.5 py-1">{tag}</span>)}</div><fieldset className="mt-5"><legend className="text-sm font-semibold mb-2">Palette</legend><div className="flex flex-wrap gap-2">{PALETTE_PICKS.map(option=>{const colors=samplePalette(canvas,design.theme,option.id);return <button key={option.id} type="button" disabled={busy} aria-pressed={pick===option.id} onClick={()=>setPick(option.id)} className={'rounded-lg border-2 px-2 py-2 text-xs '+(pick===option.id?'border-primary':'border-border')}><span className="flex mb-1 overflow-hidden rounded">{[colors.bg,colors.primary,colors.accent,colors.text].map((color,i)=><span key={i} className="w-5 h-4" style={{background:color}}/>)}</span>{option.name}</button>})}</div></fieldset><p className="text-xs text-muted-foreground text-center mt-4">Sample content for instant browsing. Applying uses your post’s saved content and brand.</p></section>
      </div>
      <footer className="shrink-0 border-t p-4 flex items-center justify-between gap-3 bg-background"><div className="min-w-0"><p className="text-sm">Current: <strong>{selected?.name||'Custom design'}</strong></p><p className="text-xs text-muted-foreground">Applies to all slides and replaces manual layout edits.</p>{error&&<p role="alert" className="text-xs text-red-500">{error}</p>}</div><Button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onSelect(active,undefined,pick);setOpen(false)}catch(e){setError(e.message||'Could not apply design')}finally{setBusy(false)}}}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<ArrowRight className="mr-2 h-4 w-4"/>}{busy?'Applying…':'Use '+design.name}</Button></footer>
    </DialogContent></Dialog></>
}
