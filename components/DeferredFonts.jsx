'use client'
import { useEffect } from 'react'

// Remote preview fonts must not delay hydration or the library's first data request.
export default function DeferredFonts({ href }) {
  useEffect(() => {
    if (document.querySelector('link[data-kand-fonts]')) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = href
    link.dataset.kandFonts = 'true'
    document.head.appendChild(link)
  }, [href])
  return null
}
