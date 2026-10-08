'use client'

import { CanvasPreview } from '@/components/CanvasPreview'
import { cn } from '@/lib/utils'

/** One slide of a generated post, rendered from its saved canvas and scaled to the container width. */
export function PostThumb({ canvas, page = 0, className = '' }) {
  return (
    <div
      className={cn('relative overflow-hidden rounded-md bg-bk-chip', className)}
      style={{ aspectRatio: `${canvas?.width || 1080} / ${canvas?.height || 1350}` }}
    >
      {canvas && <CanvasPreview canvas={canvas} pageIndex={page} />}
    </div>
  )
}

/** Placeholder slide while a post is being built for the first time. */
export function ThumbSkeleton({ className = '' }) {
  return <div aria-hidden="true" className={cn('aspect-[1080/1350] rounded-md motion-safe:animate-pulse', className)} />
}

/** Link target for a post in the editor. */
export function editorHref(canvas, idea) {
  if (!canvas?.id) return null
  const carousel = canvas.type ? canvas.type === 'carousel' : idea?.format === 'carousel'
  return carousel ? `/carousel/${canvas.id}` : `/editor/${canvas.id}`
}
