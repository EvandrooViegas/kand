'use client'

import { useId, useState } from 'react'
import { Ban, Expand } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

export default function ResolvedImagePreview({ asset, label }) {
  const backgroundId = useId()
  const [version, setVersion] = useState('original')
  const [background, setBackground] = useState('checker')
  const [failed, setFailed] = useState(false)
  const original = asset?.url || asset?.thumbnail_url
  if (!original) return <div className="w-20 h-20 shrink-0 rounded-lg border bg-muted flex items-center justify-center"><Ban className="w-5 h-5 text-muted-foreground" /></div>
  const cutout = asset?.subject?.url
  const src = version === 'cutout' && cutout ? cutout : original
  const backdrop = background === 'checker' ? {
    backgroundColor: '#eee',
    backgroundImage: 'conic-gradient(#d1d5db 25%, transparent 0 50%, #d1d5db 0 75%, transparent 0)',
    backgroundSize: '24px 24px',
  } : { backgroundColor: background === 'dark' ? '#182026' : '#fff' }

  return <Dialog onOpenChange={open => { if (open) { setVersion(cutout ? 'cutout' : 'original'); setFailed(false) } }}>
    <DialogTrigger asChild>
      <button type="button" aria-label={`Enlarge image: ${label}`} className="group relative w-20 h-20 shrink-0 rounded-lg overflow-hidden border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <img src={cutout || asset.thumbnail_url || original} alt={label} className="w-full h-full object-contain" />
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/70 text-white text-[10px] py-1"><Expand size={11} /> View large</span>
      </button>
    </DialogTrigger>
    <DialogContent className="w-[calc(100vw-2rem)] max-w-5xl max-h-[92dvh] overflow-y-auto p-4 sm:p-6">
      <DialogHeader className="pr-6">
        <DialogTitle>{label || 'Resolved image'}</DialogTitle>
        <DialogDescription>Inspect the full image and compare the background removal.</DialogDescription>
      </DialogHeader>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2" aria-label="Image version">
          <Button size="sm" variant={version === 'original' ? 'default' : 'outline'} aria-pressed={version === 'original'} onClick={() => { setVersion('original'); setFailed(false) }}>Original</Button>
          {cutout && <Button size="sm" variant={version === 'cutout' ? 'default' : 'outline'} aria-pressed={version === 'cutout'} onClick={() => { setVersion('cutout'); setFailed(false) }}>Cutout</Button>}
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor={backgroundId} className="text-xs text-muted-foreground">Background</label>
          <select id={backgroundId} value={background} onChange={event => setBackground(event.target.value)} className="rounded-md border bg-background px-2 py-1 text-sm">
            <option value="checker">Checkerboard</option><option value="light">Light</option><option value="dark">Dark</option>
          </select>
        </div>
      </div>
      <div className="rounded-lg overflow-hidden flex items-center justify-center h-[55dvh] sm:h-[65dvh] min-h-0" style={backdrop}>
        {failed ? <p role="alert" className="rounded bg-background p-4 text-sm">Could not load this image. Close and reopen the preview to retry.</p> : <img key={src} src={src} alt={`${label} — ${version}`} onError={() => setFailed(true)} className="block w-full h-full object-contain" />}
      </div>
    </DialogContent>
  </Dialog>
}
