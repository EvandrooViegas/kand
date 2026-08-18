'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { ImageIcon, Layers, FolderOpen, Check } from 'lucide-react'
import { CanvasPreview } from '@/components/CanvasPreview'
import { GalleryManager } from './GalleryManager'
import { BEBAS, TONES, LANGUAGES } from '../constants'

export function StepConfigure({
  canvases,
  selectedCanvases,
  onToggleCanvas,
  galleryId,
  onSetGallery,
  tone,
  onSetTone,
  galleries,
  onRefreshGalleries,
  carouselChance,
  onSetCarouselChance,
  language,
  onSetLanguage,
}) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const singles = canvases.filter((c) => c.type !== 'carousel')
  const carousels = canvases.filter((c) => c.type === 'carousel')
  const selectedGallery = galleries.find((g) => g.id === galleryId)
  const selectedCarousels = selectedCanvases.filter(
    (id) => canvases.find((c) => c.id === id)?.type === 'carousel'
  )
  const hasCarouselsAvailable = selectedCarousels.length > 0

  const CanvasCard = ({ c }) => {
    const isSel = selectedCanvases.includes(c.id)
    const dynCount = [
      ...(c.nodes || []),
      ...(c.pages || []).flatMap((p) => p.nodes || []),
    ].filter((n) => n.dynamic_key).length
    return (
      <button
        type="button"
        onClick={() => onToggleCanvas(c.id)}
        className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${
          isSel
            ? 'border-[#D4FF00] shadow-md'
            : 'border-foreground/15 hover:border-foreground/40'
        }`}
      >
        <div className="aspect-square relative flex items-center justify-center overflow-hidden bg-muted">
          <CanvasPreview canvas={c} />
          {isSel && (
            <div className="absolute inset-0 bg-[#D4FF00]/25 flex items-center justify-center">
              <div className="bg-[#D4FF00] rounded-full p-1.5">
                <Check className="w-4 h-4 text-foreground" />
              </div>
            </div>
          )}
          {c.type === 'carousel' && (
            <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
              Carousel
            </div>
          )}
        </div>
        <div className="p-2">
          <p className="font-bold text-xs truncate">{c.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {dynCount} dynamic key{dynCount !== 1 ? 's' : ''}
          </p>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 26 }}>CONFIGURE</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Select which layouts to use, pick a gallery for images, and set the tone of voice.
        </p>
      </div>

      <div className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Select Layouts
        </p>
        {singles.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
              <ImageIcon className="w-3 h-3" />
              Single Images
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {singles.map((c) => (
                <CanvasCard key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}
        {carousels.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1">
              <Layers className="w-3 h-3" />
              Carousels
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {carousels.map((c) => (
                <CanvasCard key={c.id} c={c} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Image Gallery
        </p>
        <p className="text-xs text-muted-foreground">
          A random image from this gallery is used for every image dynamic key.
        </p>
        <div className="flex items-center gap-3">
          <select
            className="h-9 border-2 border-foreground/20 rounded-lg px-3 text-sm bg-background flex-1 max-w-xs"
            value={galleryId || ''}
            onChange={(e) => onSetGallery(e.target.value || null)}
          >
            <option value="">— No gallery (image keys left empty) —</option>
            {galleries.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} ({g.images.length} images)
              </option>
            ))}
          </select>
          <Button variant="outline" className="border-2" onClick={() => setGalleryOpen(true)}>
            <FolderOpen className="w-4 h-4 mr-1.5" />
            Manage Galleries
          </Button>
        </div>
        {selectedGallery && (
          <div className="flex gap-1.5 flex-wrap">
            {selectedGallery.images.slice(0, 8).map((url, i) => (
              <div key={i} className="w-10 h-10 rounded overflow-hidden border border-foreground/10">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            {selectedGallery.images.length > 8 && (
              <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground">
                +{selectedGallery.images.length - 8}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Copywriting Tone
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TONES.map((t) => {
            const Icon = t.icon
            const active = tone === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSetTone(t.id)}
                className={`text-left p-3 rounded-xl border-2 transition-all ${
                  active
                    ? 'border-foreground bg-[#D4FF00]/10'
                    : 'border-foreground/10 hover:border-foreground/30'
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${active ? 'text-foreground' : 'text-muted-foreground'}`} />
                  <span className="text-xs font-bold">{t.label}</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Content Language
        </p>
        <p className="text-xs text-muted-foreground">
          All generated content and ideas will be in this language.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-w-2xl">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => onSetLanguage(lang.id)}
              className={`flex items-center gap-2 p-2.5 rounded-xl border-2 transition-all text-left ${
                language === lang.id
                  ? 'border-foreground bg-[#D4FF00]/10'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}
            >
              <span className="text-lg">{lang.flag}</span>
              <span className="text-xs font-semibold">{lang.label}</span>
            </button>
          ))}
        </div>
      </div>

      {hasCarouselsAvailable && (
        <div className="space-y-3 rounded-xl bg-indigo-600/10 border-2 border-indigo-600/30 p-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Carousel Generation Probability
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              When generating posts, what % chance should each post be a carousel vs a single
              image?
            </p>
          </div>
          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={carouselChance}
              onChange={(e) => onSetCarouselChance(parseInt(e.target.value))}
              className="flex-1 h-2 bg-indigo-600/20 rounded-lg appearance-none cursor-pointer"
              style={{
                background: `linear-gradient(to right, #4f46e5 0%, #4f46e5 ${carouselChance}%, rgba(79, 70, 229, 0.2) ${carouselChance}%, rgba(79, 70, 229, 0.2) 100%)`,
              }}
            />
            <div className="w-16 text-center">
              <div className="text-2xl font-bold text-indigo-600">{carouselChance}%</div>
              <p className="text-[9px] text-muted-foreground">Carousel</p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground">
            {carouselChance === 0 && 'All posts will be single images.'}
            {carouselChance === 100 && 'All posts will be carousels.'}
            {carouselChance > 0 && carouselChance < 100 &&
              `Each post has a ${carouselChance}% chance to be a carousel, ${
                100 - carouselChance
              }% chance to be a single image.`}
          </p>
        </div>
      )}

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <p className="text-xl font-bold" style={BEBAS}>
              IMAGE GALLERIES
            </p>
          </DialogHeader>
          <GalleryManager galleries={galleries} onRefresh={onRefreshGalleries} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
