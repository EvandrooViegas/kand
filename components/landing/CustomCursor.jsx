'use client'
import { useEffect, useRef, useState } from 'react'

const INTERACTIVE = 'a, button, summary, label, [role="button"]'

/**
 * Dot + trailing ring cursor. Only mounts for a mouse/trackpad without reduced motion,
 * so touch devices never run it. The dot follows the pointer exactly; the ring eases
 * behind it in a rAF loop that stops as soon as it catches up.
 */
export default function CustomCursor() {
  const [enabled, setEnabled] = useState(false)
  const rootRef = useRef(null)
  const dotRef = useRef(null)
  const ringRef = useRef(null)

  useEffect(() => {
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)')
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setEnabled(fine.matches && !reduced.matches)
    update()
    fine.addEventListener('change', update)
    reduced.addEventListener('change', update)
    return () => {
      fine.removeEventListener('change', update)
      reduced.removeEventListener('change', update)
    }
  }, [])

  useEffect(() => {
    if (!enabled) return
    const root = rootRef.current
    const dot = dotRef.current
    const ring = ringRef.current
    const html = document.documentElement

    let x = 0
    let y = 0
    let rx = 0
    let ry = 0
    let raf = 0
    let last = 0
    let shown = false

    const tick = (now) => {
      const dt = last ? Math.min(now - last, 64) : 16
      last = now
      const k = 1 - Math.pow(0.78, dt / 16.67)
      rx += (x - rx) * k
      ry += (y - ry) * k
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`
      if (Math.abs(x - rx) + Math.abs(y - ry) > 0.2) {
        raf = requestAnimationFrame(tick)
      } else {
        raf = 0
        last = 0
      }
    }

    const onMove = (e) => {
      x = e.clientX
      y = e.clientY
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`
      if (!shown) {
        shown = true
        rx = x
        ry = y
        ring.style.transform = `translate3d(${x}px, ${y}px, 0)`
        html.classList.add('bk-cursor-on')
        root.dataset.visible = 'true'
      }
      if (!raf) raf = requestAnimationFrame(tick)
    }

    const onOver = (e) => {
      const hovering = Boolean(e.target.closest?.(INTERACTIVE))
      if ((root.dataset.hover === 'true') !== hovering) root.dataset.hover = String(hovering)
    }
    const onDown = () => (root.dataset.down = 'true')
    const onUp = () => (root.dataset.down = 'false')
    const onLeave = () => (root.dataset.visible = 'false')
    const onEnter = () => shown && (root.dataset.visible = 'true')

    window.addEventListener('mousemove', onMove, { passive: true })
    document.addEventListener('mouseover', onOver, { passive: true })
    window.addEventListener('mousedown', onDown, { passive: true })
    window.addEventListener('mouseup', onUp, { passive: true })
    html.addEventListener('mouseleave', onLeave)
    html.addEventListener('mouseenter', onEnter)

    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onOver)
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('mouseup', onUp)
      html.removeEventListener('mouseleave', onLeave)
      html.removeEventListener('mouseenter', onEnter)
      html.classList.remove('bk-cursor-on')
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <div ref={rootRef} aria-hidden="true" className="bk-cursor pointer-events-none fixed left-0 top-0 z-[100]">
      <div ref={ringRef} className="absolute left-0 top-0 will-change-transform">
        <div className="bk-cursor-ring" />
      </div>
      <div ref={dotRef} className="absolute left-0 top-0 will-change-transform">
        <div className="bk-cursor-dot" />
      </div>
    </div>
  )
}
