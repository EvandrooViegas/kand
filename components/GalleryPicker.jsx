'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

// Transparent cutouts are shown whole on a checkerboard so their missing background is visible.
const CHECKERBOARD = { backgroundImage: 'repeating-conic-gradient(#e2e8f0 0% 25%, #ffffff 0% 50%)', backgroundSize: '12px 12px' }
const isCutout = asset => asset.source === 'ai_generated' || !!asset.subject?.url

/** The brand gallery inside the editor: saved transparent cutouts first, then brand photos. */
export default function GalleryPicker({ flowId, onPick }) {
  const [assets, setAssets] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!flowId) return
    let live = true
    fetch(`/api/assets?brand_id=${encodeURIComponent(`brand_${flowId}`)}`)
      .then(res => res.json())
      .then(data => { if (live) setAssets(Array.isArray(data) ? data.filter(a => a.status === 'ready' && a.url) : []) })
      .catch(() => { if (live) setError('Could not load the brand gallery.') })
    return () => { live = false }
  }, [flowId])

  if (!flowId) return <p className="text-sm text-muted-foreground py-6 text-center">This canvas is not linked to a brand, so it has no gallery.</p>
  if (error) return <p className="text-sm text-destructive py-6 text-center">{error}</p>
  if (!assets) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
  if (!assets.length) return <p className="text-sm text-muted-foreground py-6 text-center">No gallery images yet. Generated cutouts and uploaded brand images appear here.</p>

  const cutouts = assets.filter(isCutout), photos = assets.filter(a => !isCutout(a))
  const tile = (asset, cutout) => {
    const src = cutout ? asset.subject?.url || asset.url : asset.url
    return (
      <button key={asset.id} type="button" onClick={() => onPick(src, asset)} title={asset.description || asset.filename || ''}
        className="aspect-square rounded-md overflow-hidden border-2 border-transparent hover:border-foreground focus:outline-none focus:border-foreground bg-muted"
        style={cutout ? CHECKERBOARD : undefined}>
        <img src={cutout ? src : asset.thumbnail_url || asset.url} alt={asset.description || asset.filename || ''} loading="lazy"
          className={cutout ? 'w-full h-full object-contain p-1' : 'w-full h-full object-cover'} />
      </button>
    )
  }

  return (
    <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
      {cutouts.length > 0 && <section>
        <p className="text-xs font-semibold mb-1.5">Transparent cutouts (PNG)</p>
        <div className="grid grid-cols-4 gap-1.5">{cutouts.map(a => tile(a, true))}</div>
      </section>}
      {photos.length > 0 && <section>
        <p className="text-xs font-semibold mb-1.5">Brand photos</p>
        <div className="grid grid-cols-4 gap-1.5">{photos.map(a => tile(a, false))}</div>
      </section>}
    </div>
  )
}
