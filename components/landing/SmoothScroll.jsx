'use client'
import { useEffect } from 'react'

const EASE = 0.14 // share of the remaining distance covered per 60 fps frame

/** True when the wheel should scroll something inside the page (a panel, a list) rather than the page itself. */
function innerScroller(start, deltaY) {
  for (let el = start; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
    if (el.scrollHeight <= el.clientHeight + 1) continue
    const overflow = getComputedStyle(el).overflowY
    if (overflow !== 'auto' && overflow !== 'scroll' && overflow !== 'overlay') continue
    if (deltaY > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 1 : el.scrollTop > 0) return true
  }
  return false
}

/**
 * Eased mouse-wheel and trackpad scrolling on desktop. The page still scrolls natively (so sticky headers, scroll
 * reveals and anchors keep working): only the wheel's jumps are smoothed. Touch, keyboard, scrollbar dragging,
 * Ctrl+wheel zoom, horizontal wheels, inner scroll areas and pages locked by a dialog are left untouched.
 * Off for coarse pointers and reduced motion.
 */
export default function SmoothScroll() {
  useEffect(() => {
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let target = window.scrollY
    let current = window.scrollY
    let raf = 0
    let last = 0

    const stop = () => { cancelAnimationFrame(raf); raf = 0; last = 0 }
    const tick = now => {
      // Someone else moved the page (scrollbar, keyboard, an anchor): hand control back.
      if (Math.abs(window.scrollY - Math.round(current)) > 2) { stop(); return }
      const dt = last ? Math.min(now - last, 64) : 16.67
      last = now
      current += (target - current) * (1 - Math.pow(1 - EASE, dt / 16.67))
      if (Math.abs(target - current) < 0.5) current = target
      window.scrollTo({ top: current, behavior: 'instant' })
      if (current === target) stop()
      else raf = requestAnimationFrame(tick)
    }

    const onWheel = e => {
      if (e.defaultPrevented || e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (document.body.hasAttribute('data-scroll-locked') || getComputedStyle(document.body).overflow === 'hidden') return
      if (innerScroller(e.target, e.deltaY)) return
      e.preventDefault()
      if (!raf) target = current = window.scrollY
      const unit = e.deltaMode === 1 ? 40 : e.deltaMode === 2 ? window.innerHeight : 1
      const max = document.documentElement.scrollHeight - window.innerHeight
      target = Math.max(0, Math.min(max, target + e.deltaY * unit))
      if (!raf) raf = requestAnimationFrame(tick)
    }

    window.addEventListener('wheel', onWheel, { passive: false })
    return () => { window.removeEventListener('wheel', onWheel); stop() }
  }, [])

  return null
}
