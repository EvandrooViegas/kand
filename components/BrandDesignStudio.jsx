'use client'
import {generateBrandBatch} from '@/lib/designs/generateBrandBatch'
import {useState} from 'react'
import {Sample} from '@/components/DesignLibrary'
import {DESIGN_LIBRARY} from '@/lib/designs/library'
import {Button} from '@/components/ui/button'
import {Card,CardHeader,CardTitle,CardDescription,CardContent} from '@/components/ui/card'
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog'
import {Loader2,Sparkles,Trash2} from 'lucide-react'
export default function BrandDesignStudio({flowId,brand,onChange}) {
 const [progress,setProgress]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[preview,setPreview]=useState(null),[chapter,setChapter]=useState(0)
 const designs=brand.designs||[]
 const canvas={brandContext:brand}
 const expand=d=>({...DESIGN_LIBRARY.find(x=>x.id===d.baseId),...d})
 return <Card><CardHeader><CardTitle>Your brand designs</CardTitle><CardDescription>Every brand includes at least 3 reusable designs. Add more directions from your identity; saved designs are used for new posts.</CardDescription></CardHeader><CardContent className="space-y-4">
 <Button disabled={busy||!flowId||!brand.name} onClick={async()=>{setBusy(true);setError('');setNotice('');try{await generateBrandBatch({flowId,brand,onSaved:onChange,onProgress:setProgress});setNotice('Your new design is saved.')}catch(e){setError(e.message)}finally{setBusy(false);setProgress('')}}}>{busy?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Sparkles className="mr-2 h-4 w-4"/>}{busy?'Creating your design…':'Generate brand design'}</Button>
 {busy&&<p role="status" aria-live="polite" className="text-sm text-muted-foreground">{progress}</p>}
 {!flowId&&<p className="text-sm">Save your brand before generating designs.</p>}{error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
 {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">{designs.map(d=><div key={d.id} className="relative"><button className="rounded-xl border overflow-hidden text-left hover:ring-2 hover:ring-primary" onClick={()=>{setPreview(d);setChapter(0)}}><Sample design={expand(d)} canvas={canvas} pick={d.paletteId}/><div className="p-3"><p className="font-semibold">{d.name}</p><p className="text-xs text-muted-foreground mt-1">{d.tags.join(' · ')}</p><p className="text-xs mt-2">Preview design</p></div></button><Button variant="destructive" size="sm" disabled={busy||designs.length<=3} title={designs.length<=3?"Add another design first — brands must keep at least 3 designs.":"Delete design"} aria-label={'Delete '+d.name} className="absolute top-2 right-2" onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/api/brand-designs',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({flowId,designId:d.id})});if(!r.ok){const data=await r.json();throw Error(data.error||'Could not delete design')}onChange({...brand,designs:designs.filter(item=>item.id!==d.id)});if(preview?.id===d.id)setPreview(null)}catch(e){setError(e.message)}finally{setBusy(false)}}}><Trash2 className="h-4 w-4"/></Button></div>)}</div>
 <Dialog open={!!preview} onOpenChange={v=>{if(!v)setPreview(null)}}><DialogContent className="max-w-3xl max-h-[92dvh] overflow-y-auto"><DialogTitle>{preview?.name}</DialogTitle><DialogDescription>{preview?.rationale}</DialogDescription>{preview&&<>{preview.blueprint&&<p className="text-xs text-muted-foreground">{preview.blueprint.theme} · {preview.blueprint.imagery.style} · {preview.blueprint.imagery.placement} · {preview.blueprint.highlight.replaceAll('_',' ')} highlights</p>}<div className="max-w-[440px] w-full mx-auto shadow-xl rounded-lg overflow-hidden"><Sample design={expand(preview)} canvas={canvas} chapter={chapter} pick={preview.paletteId}/></div><div className="flex gap-2 justify-center">{['Cover','Content','Closing'].map((name,i)=><Button key={name} variant={chapter===i?'default':'outline'} onClick={()=>setChapter(i)}>{name}</Button>)}</div><p className="text-xs text-muted-foreground">Brand composition with sample imagery. Your post text and generated assets replace these placeholders.</p></>}</DialogContent></Dialog>
 </CardContent></Card>
}
