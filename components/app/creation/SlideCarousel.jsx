'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PostThumb, ThumbSkeleton } from './PostThumb'

const GAP = 14
const SWIPE = 40 // px of drag that turns the slide

/**
 * The slides of a post: the current one centred, its neighbours peeking in smaller and dimmed.
 * Arrows, dots, swipe/drag and the arrow keys move between slides; clicking the centred slide opens it.
 * Without a canvas it shows `count` placeholder slides (a post being built for the first time).
 */
export function SlideCarousel({ canvas, count = 1, onOpen, dimmed = false, tone = 'dark', className = '' }) {
  const total = canvas ? (canvas.type === 'carousel' ? canvas.pages?.length || 1 : 1) : count
  const [index, setIndex] = useState(0)
  const [drag, setDrag] = useState(0)
  const start = useRef(null)
  const moved = useRef(false)

  // A new post (or a rebuilt one) starts at its cover.
  useEffect(() => { setIndex(0) }, [canvas?.id])
  const go = next => setIndex(Math.max(0, Math.min(total - 1, next)))

  const onPointerDown = e => {
    if (total < 2 || (e.pointerType === 'mouse' && e.button !== 0)) return
    start.current = e.clientX
    moved.current = false
  }
  const onPointerMove = e => {
    if (start.current === null) return
    const dx = e.clientX - start.current
    if (Math.abs(dx) > 6) {
      if (!moved.current) e.currentTarget.setPointerCapture?.(e.pointerId)
      moved.current = true
    }
    // Resist past the first and last slide.
    setDrag((index === 0 && dx > 0) || (index === total - 1 && dx < 0) ? dx / 3 : dx)
  }
  const onPointerEnd = () => {
    if (start.current === null) return
    if (drag <= -SWIPE) go(index + 1)
    else if (drag >= SWIPE) go(index - 1)
    start.current = null
    setDrag(0)
  }

  const dark = tone === 'dark'
  const arrow = cn(
    'absolute top-1/2 z-10 flex size-8 -translate-y-1/2 items-center justify-center rounded-full shadow-bk-card transition-[opacity,transform] duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-0',
    dark ? 'bg-white/90 text-bk-ink focus-visible:outline-bk-butter' : 'border border-bk-line bg-bk-surface text-bk-fg focus-visible:outline-bk-fg',
  )

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Post slides"
      onKeyDown={e => {
        if (e.key === 'ArrowRight') { e.preventDefault(); go(index + 1) }
        if (e.key === 'ArrowLeft') { e.preventDefault(); go(index - 1) }
      }}
      className={cn('relative w-full', className)}
    >
      <div
        className="touch-pan-y select-none overflow-hidden py-2 [container-type:inline-size]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <ol
          className={cn('flex', drag ? '' : 'transition-transform duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)]')}
          style={{
            gap: GAP,
            '--w': 'min(56cqw, 232px)',
            transform: `translateX(calc(50cqw - var(--w) / 2 - ${index} * (var(--w) + ${GAP}px) + ${drag}px))`,
          }}
        >
          {Array.from({ length: total }, (_, page) => {
            const current = page === index
            return (
              <li key={page} className="shrink-0" style={{ width: 'var(--w)' }} aria-roledescription="slide" aria-label={`Slide ${page + 1} of ${total}`}>
                <button
                  type="button"
                  tabIndex={current ? 0 : -1}
                  onClick={() => { if (moved.current) return; current ? canvas && onOpen?.(page) : go(page) }}
                  aria-label={current ? `Open slide ${page + 1} in the preview` : `Show slide ${page + 1}`}
                  className={cn(
                    'block w-full origin-center rounded-lg transition-[transform,opacity] duration-500 ease-[cubic-bezier(0.2,0.7,0.2,1)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
                    dark ? 'focus-visible:outline-bk-butter' : 'focus-visible:outline-bk-fg',
                    current ? 'scale-100 opacity-100' : 'scale-[0.84] opacity-40 hover:opacity-70',
                  )}
                >
                  {canvas
                    ? <PostThumb canvas={canvas} page={page} className={cn('rounded-lg', dark ? 'ring-1 ring-white/10' : 'shadow-bk-card', dimmed && 'opacity-60')} />
                    : <ThumbSkeleton className={cn('rounded-lg', dark ? 'bg-white/[0.07]' : 'bg-bk-chip')} />}
                </button>
              </li>
            )
          })}
        </ol>
      </div>

      {total > 1 && (
        <>
          <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous slide" className={cn(arrow, 'left-1')}>
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={() => go(index + 1)} disabled={index === total - 1} aria-label="Next slide" className={cn(arrow, 'right-1')}>
            <ChevronRight className="size-4" />
          </button>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            {Array.from({ length: total }, (_, page) => (
              <button
                key={page}
                type="button"
                onClick={() => go(page)}
                aria-label={`Go to slide ${page + 1}`}
                aria-current={page === index ? 'true' : undefined}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  page === index ? cn('w-5', dark ? 'bg-bk-butter' : 'bg-bk-fg') : cn('w-1.5', dark ? 'bg-white/25 hover:bg-white/50' : 'bg-bk-fg/20 hover:bg-bk-fg/40'),
                )}
              />
            ))}
          </div>
          <p className="sr-only" aria-live="polite">Slide {index + 1} of {total}</p>
        </>
      )}
    </div>
  )
}
