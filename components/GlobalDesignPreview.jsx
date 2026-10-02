'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CanvasPreview } from '@/components/CanvasPreview'
import { resolveVariant, SAMPLE_COPY } from '@/lib/designs/global/resolve'
const DEMO_BRAND = { name: 'Your brand', website: 'https://yourbrand.com', colors: ['#ed5125', '#101327', '#ffe05b'] }

export default function GlobalDesignPreview({ family, brand = {}, variantId, copy, image = '' }) {
  const ref = useRef(null), [visible, setVisible] = useState(false)
  const variant = family.variants.find(v => v.id === variantId) || family.variants[0]
  useEffect(() => {
    const observer = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { setVisible(true); observer.disconnect() } }, { rootMargin: '200px' })
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])
  const canvas = useMemo(() => {
    if (!visible) return null
    // Reference colors belong only to unbranded library previews. Brand imports use brand tokens.
    const previewBrand = Object.keys(brand).length ? { ...DEMO_BRAND, ...brand }
      : { ...DEMO_BRAND, ...(family.referenceStyle ? { designTokens: family.referenceStyle } : {}) }
    const hasReplaceablePhoto = variant.nodes.some(n => n.src === '{{image.primary}}')
    const photoDoodle = hasReplaceablePhoto && /hand.drawn|doodle|scribble|script|neon/i.test(family.analysis || '')
    const referencePreview = family.identityVersion !== 1 && !Object.keys(brand).length && !copy && !image
    const cutout = variant.imagery === 'cutout' || family.designType === 'cutout' || variant.nodes.some(n => n.imageType === 'cutout')
    const previewImage = image || (hasReplaceablePhoto && !cutout ? '/design-photo-placeholder.webp' : '')
    const previewCopy = photoDoodle && variant.role === 'cover'
      ? { ...SAMPLE_COPY, headline: 'Highlights\nof my year', eyebrow: '(2030) Year end recap', body: 'as a content\ncreator', cta: '' }
      : { ...SAMPLE_COPY, ...(variant.role === 'cover' ? { body: 'Start with one practical step.', ...(hasReplaceablePhoto ? { headline: 'Live with purpose' } : {}) } : {}) }
    return resolveVariant(family, variant, previewBrand, copy || previewCopy, 0, previewImage, { preview: true, referencePreview })
  }, [family, variant, brand, copy, image, visible])
  useEffect(() => {
    if (!canvas) return
    for (const font of new Set(canvas.nodes.filter(n => n.type === 'text').map(n => n.fontFamily))) {
      if ([...document.querySelectorAll('link[data-design-font]')].some(link => link.dataset.designFont === font)) continue
      const link = document.createElement('link')
      link.rel = 'stylesheet'; link.dataset.designFont = font
      link.href = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(font)}&display=swap`
      document.head.appendChild(link)
    }
  }, [canvas])
  return <div ref={ref} className="relative w-full overflow-hidden rounded-lg bg-slate-100" style={{ aspectRatio: `${family.width}/${family.height}` }}>
    {canvas ? <CanvasPreview canvas={canvas} /> : <span role="status" className="absolute inset-0 flex items-center justify-center text-xs text-slate-400">Loading preview…</span>}
  </div>
}
