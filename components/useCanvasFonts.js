'use client'

import { useEffect, useState } from 'react'

// Installed on every device; Google Fonts does not serve them.
const SYSTEM_FONTS = new Set(['arial', 'helvetica', 'impact', 'georgia', 'times new roman', 'verdana', 'tahoma', 'trebuchet ms', 'courier new', 'sans-serif', 'serif', 'monospace', 'system-ui'])

function canvasFonts(canvas) {
  const fonts = new Map()
  const scan = nodes => { for (const n of nodes || []) if (n?.type === 'text' && n.fontFamily) {
    const weights = fonts.get(n.fontFamily) || new Set()
    weights.add(Number(n.fontWeight) || 400)
    fonts.set(n.fontFamily, weights)
  } }
  scan(canvas?.nodes)
  for (const page of canvas?.pages || []) scan(page.nodes)
  return fonts
}

/**
 * Loads every Google font a canvas uses, so text renders and measures in its real font instead of a wider fallback.
 * Each weight is its own request: Google rejects a whole request that names a weight the family lacks (Anton has only
 * 400), so one missing weight never blocks the others. Returns true once the document's fonts have finished loading.
 */
export function useCanvasFonts(canvas) {
  const [ready, setReady] = useState(false)
  const fonts = canvasFonts(canvas)
  const key = [...fonts].map(([family, weights]) => `${family}:${[...weights].sort().join(',')}`).sort().join('|')
  useEffect(() => {
    if (typeof document === 'undefined') return
    let added = false
    for (const [family, weights] of fonts) {
      if (SYSTEM_FONTS.has(family.toLowerCase())) continue
      for (const weight of new Set([400, ...weights])) {
        const id = `${family}:${weight}`
        if (document.querySelector(`link[data-canvas-font="${CSS.escape(id)}"]`)) continue
        const link = document.createElement('link')
        link.rel = 'stylesheet'
        link.dataset.canvasFont = id
        link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}${weight === 400 ? '' : `:wght@${weight}`}&display=swap`
        document.head.appendChild(link)
        added = true
      }
    }
    let live = true
    const settle = () => { if (live && document.fonts?.status !== 'loading') setReady(true) }
    if (!document.fonts) { setReady(true); return }
    setReady(!added && document.fonts.status === 'loaded')
    // Stylesheets register their faces asynchronously; wait for the browser to report fonts settled.
    const timer = setTimeout(() => document.fonts.ready.then(settle), added ? 150 : 0)
    document.fonts.addEventListener?.('loadingdone', settle)
    return () => { live = false; clearTimeout(timer); document.fonts.removeEventListener?.('loadingdone', settle) }
  }, [key])
  return ready
}
