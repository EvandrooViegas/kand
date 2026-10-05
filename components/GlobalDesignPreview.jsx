'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react'
import { CanvasPreview } from '@/components/CanvasPreview'
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { resolveVariant, referencePreviewBrand, SAMPLE_COPY } from '@/lib/designs/global/resolve'
import { previewSlide, SAMPLE_DECK } from '@/lib/designs/global/compose'
const DEMO_BRAND = { name: 'Your brand', website: 'https://yourbrand.com', colors: ['#ed5125', '#101327', '#ffe05b'] }
export const COMPOSITION_LABELS = { statement: 'Statement', stacked: 'Stacked', split: 'Split', 'image-led': 'Image-led', 'backdrop-type': 'Backdrop type', list: 'List', closing: 'Closing' }

// Reference colors belong only to unbranded library previews. Brand previews use brand tokens.
const previewBrandFor = (family, brand) => Object.keys(brand).length ? { ...DEMO_BRAND, ...brand } : { ...DEMO_BRAND, ...referencePreviewBrand(family) }

/**
 * Previews a design study as the composer would build it for sample content (`sample` = beat 0-3).
 * `reconstruction` previews one reference reconstruction instead (review/debug only).
 */
export default function GlobalDesignPreview({ family, brand = {}, sample = 0, reconstruction, eager = false }) {
  const ref = useRef(null), [visible, setVisible] = useState(eager)
  useEffect(() => {
    if (eager) return
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [eager])
  const canvas = useMemo(() => {
    if (!visible) return null
    const previewBrand = previewBrandFor(family, brand)
    try {
      if (reconstruction) return resolveVariant(family, reconstruction, previewBrand, SAMPLE_COPY, 0, '', { preview: true })
      return previewSlide(family, previewBrand, sample)
    } catch { return null }
  }, [family, brand, sample, reconstruction, visible])
  useEffect(() => {
    if (!canvas) return
    for (const font of new Set(canvas.nodes.filter(n => n.type === 'text').map(n => n.fontFamily))) {
      if ([...document.querySelectorAll('link[data-design-font]')].some(link => link.dataset.designFont === font)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.dataset.designFont = font
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap`
      document.head.appendChild(link)
    }
  }, [canvas])
  const photo = canvas?.nodes.some(n => n.designRole === 'image-placeholder' || (reconstruction && n.type === 'shape' && reconstruction.nodes.some(r => r.src === '{{image.primary}}' && r.id === n.id)))
  return <div ref={ref} className="relative w-full overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: `${family.width}/${family.height}` }}>
    {canvas ? <CanvasPreview canvas={canvas} /> : <span role="status" className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">{visible ? 'Preview unavailable' : 'Loading preview…'}</span>}
    {photo && <span className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-[10px] text-white">Replaceable photo area</span>}
  </div>
}

/** Enlarged view of the study's sample compositions, with previous/next navigation. */
export function SampleLightbox({ family, brand = {}, index, onIndex, onClose, count = SAMPLE_DECK.length }) {
  const open = index !== null && index !== undefined
  const current = open ? index : 0
  const composition = useMemo(() => { try { return previewSlide(family, previewBrandFor(family, brand), current).composition } catch { return '' } }, [family, brand, current])
  const go = step => onIndex((current + step + count) % count)
  return <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
    <DialogContent className="w-auto max-w-[96vw] gap-3 p-4 sm:p-5" onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); go(1) } if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) } }}>
      <div className="pr-8"><DialogTitle className="text-base">{family.name}</DialogTitle><DialogDescription>Sample {current + 1} of {count}{composition ? ` · ${COMPOSITION_LABELS[composition] || composition}` : ''} · generated from the study with sample copy</DialogDescription></div>
      {/* Fits the viewport while keeping the design's aspect ratio. */}
      <div style={{ width: `min(90vw, calc(78vh * ${family.width} / ${family.height}))` }}>{open && <GlobalDesignPreview key={current} family={family} brand={brand} sample={current} eager />}</div>
      {count > 1 && <div className="flex items-center justify-between gap-3">
        <button type="button" onClick={() => go(-1)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"><ChevronLeft size={16} />Previous</button>
        <div className="flex gap-1.5" role="group" aria-label="Samples">{Array.from({ length: count }, (_, i) => <button type="button" key={i} aria-label={`Sample ${i + 1}`} aria-current={i === current} onClick={() => onIndex(i)} className={`h-2 w-6 rounded-full ${i === current ? 'bg-foreground' : 'bg-muted'}`} />)}</div>
        <button type="button" onClick={() => go(1)} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm hover:bg-muted">Next<ChevronRight size={16} /></button>
      </div>}
    </DialogContent>
  </Dialog>
}

/** A preview that opens the sample lightbox when clicked. */
export function ZoomablePreview({ family, brand = {}, sample = 0, className = '' }) {
  const [zoom, setZoom] = useState(null)
  return <>
    <button type="button" aria-label={`Enlarge ${family.name} sample ${sample + 1}`} onClick={() => setZoom(sample)} className={`group relative block w-full cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${className}`}>
      <GlobalDesignPreview family={family} brand={brand} sample={sample} />
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><ZoomIn size={14} /></span>
    </button>
    <SampleLightbox family={family} brand={brand} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} />
  </>
}

/** A small strip of sample compositions: shows the study as a language, not one layout. Click one to enlarge. */
export function StudySamples({ family, brand = {}, count = SAMPLE_DECK.length, className = 'grid grid-cols-2 gap-2' }) {
  const [zoom, setZoom] = useState(null)
  return <>
    <div className={className}>{Array.from({ length: count }, (_, i) => <button type="button" key={i} aria-label={`Enlarge sample ${i + 1}`} onClick={() => setZoom(i)} className="group relative block cursor-zoom-in rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <GlobalDesignPreview family={family} brand={brand} sample={i} />
      <span className="pointer-events-none absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"><ZoomIn size={12} /></span>
    </button>)}</div>
    <SampleLightbox family={family} brand={brand} index={zoom} onIndex={setZoom} onClose={() => setZoom(null)} count={count} />
  </>
}
