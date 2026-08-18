'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import {
  Layers, ChevronLeft, ChevronRight, Download, Trash2,
  Maximize2, Pencil, Check
} from 'lucide-react'

export function PostCard({
  post,
  onView,
  onEdit,
  onDelete,
  onAccept,
}) {
  const url = post.render?.url
  const isCarousel = post.type === 'carousel'
  const [carouselIndex, setCarouselIndex] = useState(0)
  const [carouselPages, setCarouselPages] = useState(null)
  const [loadingCarousel, setLoadingCarousel] = useState(false)

  useEffect(() => {
    if (!isCarousel || !url || carouselPages) return

    const loadCarousel = async () => {
      setLoadingCarousel(true)
      try {
        const response = await fetch(url)
        const blob = await response.blob()
        const jsZip = new (await import('jszip')).default()
        const zip = await jsZip.loadAsync(blob)
        const pages = []
        const files = Object.keys(zip.files)
          .filter((f) => f.endsWith('.png'))
          .sort()

        for (const filename of files) {
          const file = zip.files[filename]
          const data = await file.async('blob')
          const urlObj = URL.createObjectURL(data)
          pages.push({ filename, url: urlObj })
        }

        setCarouselPages(pages)
        setCarouselIndex(0)
      } catch (e) {
        console.error('Failed to load carousel:', e)
      } finally {
        setLoadingCarousel(false)
      }
    }

    loadCarousel()
  }, [isCarousel, url, carouselPages])

  return (
    <div
      className={`rounded-xl border-2 overflow-hidden transition-all flex flex-col ${
        post.status === 'accepted'
          ? 'border-[#9AB800]'
          : post.status === 'rejected'
          ? 'border-foreground/10 opacity-40'
          : 'border-foreground/15'
      }`}
    >
      <div
        className="bg-muted relative overflow-hidden shrink-0 flex items-center justify-center max-h-96 cursor-pointer group"
        style={{ minHeight: '300px' }}
        onClick={() => onView(post)}
      >
        {isCarousel && carouselPages && carouselPages.length > 0 ? (
          <div className="w-full h-full flex flex-col items-center justify-center">
            <img
              src={carouselPages[carouselIndex].url}
              alt={`Slide ${carouselIndex + 1}`}
              className="max-w-full max-h-full object-contain group-hover:opacity-90 transition"
            />
            {carouselPages.length > 1 && (
              <div
                className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-2 bg-black/20"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCarouselIndex(Math.max(0, carouselIndex - 1))
                  }}
                  disabled={carouselIndex === 0}
                  className="text-white hover:text-white/70 disabled:opacity-30 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-white font-bold">
                  {carouselIndex + 1} / {carouselPages.length}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    setCarouselIndex(Math.min(carouselPages.length - 1, carouselIndex + 1))
                  }}
                  disabled={carouselIndex === carouselPages.length - 1}
                  className="text-white hover:text-white/70 disabled:opacity-30 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        ) : isCarousel && loadingCarousel ? (
          <div className="h-full flex items-center justify-center">
            <div className="animate-spin">
              <Layers className="w-6 h-6 text-muted-foreground" />
            </div>
          </div>
        ) : isCarousel && url ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-muted-foreground group-hover:opacity-70 transition">
            <Layers className="w-6 h-6 opacity-30" />
            <span className="text-[9px]">Carousel</span>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-[9px] text-muted-foreground hover:text-foreground underline"
            >
              Download ZIP
            </a>
          </div>
        ) : !isCarousel && url ? (
          <img
            src={url}
            alt=""
            className="max-w-full max-h-full object-contain group-hover:opacity-90 transition"
          />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Layers className="w-6 h-6 opacity-30" />
            <span className="text-[9px]">
              {isCarousel ? 'Carousel' : 'Rendering...'}
            </span>
          </div>
        )}
        {post.status === 'accepted' && (
          <div className="absolute top-2 right-2 bg-[#9AB800] rounded-full p-1">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center pointer-events-none">
          <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition" />
        </div>
      </div>

      <div className="flex flex-col flex-1 min-h-0">
        <div className="p-3 border-b border-foreground/10">
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="text-[10px] font-bold truncate flex-1">{post.canvasName}</p>
            <div
              title={post.canvasName}
              className="text-muted-foreground hover:text-foreground transition cursor-help shrink-0"
            >
              <Layers className="w-3 h-3" />
            </div>
          </div>
          {post.caption && (
            <p className="text-[9px] text-foreground/70 leading-snug line-clamp-2">
              "{post.caption}"
            </p>
          )}
        </div>
      </div>

      <div className="flex border-t border-foreground/10 text-[10px]">
        <button
          onClick={() => onView(post)}
          className="flex-1 h-8 text-muted-foreground hover:bg-muted transition flex items-center justify-center gap-1 font-semibold"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          View
        </button>
        <button
          onClick={() => onEdit(post)}
          className="flex-1 h-8 text-muted-foreground hover:bg-muted transition flex items-center justify-center gap-1 border-l border-foreground/10"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="flex-1">
            <button className="w-full h-8 text-muted-foreground hover:bg-muted transition flex items-center justify-center border-l border-foreground/10">
              <Download className="w-3 h-3" />
            </button>
          </a>
        )}
        {post.status !== 'accepted' && (
          <button
            onClick={() => onAccept(post.id)}
            className="flex-1 h-8 text-[#9AB800] hover:bg-[#9AB800]/10 transition flex items-center justify-center border-l border-foreground/10"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={() => onDelete(post.id)}
          className="flex-1 h-8 text-destructive hover:bg-destructive/10 transition flex items-center justify-center border-l border-foreground/10"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  )
}
