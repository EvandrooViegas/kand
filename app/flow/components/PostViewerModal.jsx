'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import {
  Maximize2, ChevronLeft, ChevronRight, Download, Calendar,
  CheckCircle, XCircle, Clock, ImageIcon, Type, Layers
} from 'lucide-react'

export function PostViewerModal({ post, canvases, open, onClose }) {
  const canvas = canvases.find((c) => c.id === post?.canvasId)
  const url = post?.render?.url
  const isCarousel = post?.canvasType === 'carousel'
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

  const allNodes = canvas
    ? [
        ...(canvas.nodes || []),
        ...(canvas.pages || []).flatMap((p) => p.nodes || []),
      ].filter((n) => n.dynamic_key)
    : []

  if (!post) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <Maximize2 className="w-4 h-4" />
            Full Post View — {post.canvasName}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-4">
          <div className="lg:col-span-2 space-y-2">
            <div
              className="relative w-full bg-muted rounded-2xl overflow-hidden flex items-center justify-center"
              style={{ aspectRatio: '1080/1080' }}
            >
              {isCarousel && carouselPages && carouselPages.length > 0 ? (
                <div className="w-full h-full flex flex-col items-center justify-center">
                  <img
                    src={carouselPages[carouselIndex].url}
                    alt={`Slide ${carouselIndex + 1}`}
                    className="w-full h-full object-contain"
                  />
                  {carouselPages.length > 1 && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between p-3 bg-black/40 backdrop-blur-sm">
                      <button
                        onClick={() => setCarouselIndex(Math.max(0, carouselIndex - 1))}
                        disabled={carouselIndex === 0}
                        className="text-white hover:text-white/70 disabled:opacity-20 transition"
                      >
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <span className="text-xs text-white font-bold">
                        {carouselIndex + 1} / {carouselPages.length}
                      </span>
                      <button
                        onClick={() =>
                          setCarouselIndex(
                            Math.min(carouselPages.length - 1, carouselIndex + 1)
                          )
                        }
                        disabled={carouselIndex === carouselPages.length - 1}
                        className="text-white hover:text-white/70 disabled:opacity-20 transition"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                  )}
                </div>
              ) : isCarousel && loadingCarousel ? (
                <div className="flex items-center justify-center">
                  <div className="animate-spin">
                    <Layers className="w-8 h-8 text-muted-foreground" />
                  </div>
                </div>
              ) : isCarousel && url ? (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Layers className="w-8 h-8 opacity-30" />
                  <span className="text-sm">Carousel</span>
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-muted-foreground hover:text-foreground underline"
                  >
                    Download ZIP
                  </a>
                </div>
              ) : !isCarousel && url ? (
                <img src={url} alt="" className="w-full h-full object-contain" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <Layers className="w-8 h-8 opacity-30" />
                  <span className="text-sm">{isCarousel ? 'Carousel' : 'Rendering...'}</span>
                </div>
              )}
            </div>
            {url && !isCarousel && (
              <div className="text-right">
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] text-muted-foreground hover:text-foreground underline flex items-center justify-end gap-1"
                >
                  <Download className="w-3 h-3" /> Download Full Resolution
                </a>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border-2 border-foreground/10 p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Status
              </p>
              <div className="flex items-center gap-2">
                {post.status === 'accepted' ? (
                  <>
                    <CheckCircle className="w-4 h-4 text-[#9AB800]" />
                    <span className="text-sm font-bold text-[#9AB800]">Accepted</span>
                  </>
                ) : post.status === 'rejected' ? (
                  <>
                    <XCircle className="w-4 h-4 text-destructive" />
                    <span className="text-sm font-bold text-destructive">Rejected</span>
                  </>
                ) : (
                  <>
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="text-sm font-bold text-amber-600">Pending Review</span>
                  </>
                )}
              </div>
              {post.scheduledAt && (
                <div className="flex items-center gap-2 pt-2 border-t border-foreground/10">
                  <Calendar className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    {new Date(post.scheduledAt).toLocaleString()}
                  </span>
                </div>
              )}
            </div>

            {post.caption && (
              <div className="rounded-xl border-2 border-foreground/10 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Caption
                </p>
                <p className="text-sm leading-snug">{post.caption}</p>
              </div>
            )}

            {allNodes.length > 0 && (
              <div className="rounded-xl border-2 border-foreground/10 p-3 space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  Content
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {allNodes.map((node) => {
                    const key = node.dynamic_key
                    const value = post.data?.[key]
                    if (!value) return null
                    return (
                      <div key={key} className="text-[9px] space-y-0.5">
                        <div className="flex items-center gap-1 font-bold text-muted-foreground">
                          {node.type === 'image' ? (
                            <ImageIcon className="w-3 h-3" />
                          ) : (
                            <Type className="w-3 h-3" />
                          )}
                          <code className="font-mono">{key}</code>
                        </div>
                        {node.type === 'image' && value ? (
                          <img
                            src={value}
                            alt=""
                            className="h-16 rounded object-cover border border-foreground/10"
                            onError={(e) => (e.target.style.display = 'none')}
                          />
                        ) : node.type === 'text' && value ? (
                          <p className="text-foreground/70 break-words line-clamp-3">
                            {value}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-foreground/10 justify-end">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
