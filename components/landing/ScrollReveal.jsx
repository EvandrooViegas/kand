'use client'
import { useEffect } from 'react'

/**
 * Fades `[data-reveal]` elements in as they enter the viewport, using one shared
 * IntersectionObserver. Elements already on screen (or scrolled past) when the page
 * loads are left alone so nothing flickers. Stagger with `style={{ '--i': n }}`.
 */
export default function ScrollReveal() {
  useEffect(() => {
    const root = document.querySelector('.bk-root')
    if (!root || !('IntersectionObserver' in window)) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const viewportBottom = window.innerHeight
    const pending = []
    root.querySelectorAll('[data-reveal]').forEach((el) => {
      if (el.getBoundingClientRect().top < viewportBottom) el.removeAttribute('data-reveal')
      else pending.push(el)
    })

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0 },
    )

    root.classList.add('bk-reveal-ready')
    pending.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])

  return null
}
