'use client'
import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function CaseStudyCard({ caseStudy }) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0)

  if (!caseStudy) return null

  const images = caseStudy.images || []
  const currentImage = images[currentImageIndex]

  const goToPrevious = () => {
    setCurrentImageIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1))
  }

  const goToNext = () => {
    setCurrentImageIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1))
  }

  return (
    <div className="w-full bg-card border-2 border-foreground/90 rounded-xl overflow-hidden">
      <div className="flex flex-col md:flex-row gap-0 h-full">
        {/* Left side: 75% - Carousel with 16:9 ratio */}
        <div className="w-full md:w-3/4 bg-muted/40 flex flex-col items-center justify-center relative group">
          {/* Image container with 16:9 aspect ratio */}
          <div className="w-full aspect-video relative overflow-hidden bg-black flex items-center justify-center">
            {currentImage ? (
              <img
                src={currentImage}
                alt={`${caseStudy.name} - Image ${currentImageIndex + 1}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="text-muted-foreground text-sm">No images</div>
            )}
          </div>

          {/* Carousel controls - only show if there are multiple images */}
          {images.length > 1 && (
            <>
              {/* Previous button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={goToPrevious}
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Previous image"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>

              {/* Next button */}
              <Button
                size="icon"
                variant="ghost"
                onClick={goToNext}
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full h-10 w-10 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                title="Next image"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>

              {/* Image counter */}
              <div className="absolute bottom-3 right-3 bg-black/60 text-white px-2 py-1 rounded text-xs font-semibold">
                {currentImageIndex + 1} / {images.length}
              </div>

              {/* Thumbnail dots */}
              <div className="absolute bottom-3 left-3 flex gap-1.5">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => setCurrentImageIndex(idx)}
                    className={`w-2 h-2 rounded-full transition-all ${
                      idx === currentImageIndex
                        ? 'bg-white w-6'
                        : 'bg-white/50 hover:bg-white/70'
                    }`}
                    title={`Go to image ${idx + 1}`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right side: 25% - Client info */}
        <div className="w-full md:w-1/4 p-5 md:p-6 flex flex-col justify-between border-t-2 md:border-t-0 md:border-l-2 border-foreground/90 space-y-4">
          {/* Client logo */}
          {caseStudy.logo && (
            <div className="h-16 md:h-14 mb-2">
              <img
                src={caseStudy.logo}
                alt={`${caseStudy.name} logo`}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          {/* Client name */}
          <div>
            <p className="text-[11px] uppercase tracking-widest text-foreground/60 font-semibold mb-1">Client</p>
            <h3 className="text-lg md:text-base font-bold leading-tight">{caseStudy.name}</h3>
          </div>

          {/* Services */}
          {caseStudy.services && caseStudy.services.length > 0 && (
            <div>
              <p className="text-[11px] uppercase tracking-widest text-foreground/60 font-semibold mb-2">Services</p>
              <div className="flex flex-wrap gap-1.5">
                {caseStudy.services.map((service, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-1 bg-[#D4FF00]/20 border border-[#9AB800] rounded-full text-foreground font-semibold"
                  >
                    {service}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Description */}
          {caseStudy.description && (
            <div>
              <p className="text-[11px] uppercase tracking-widest text-foreground/60 font-semibold mb-2">About</p>
              <p className="text-xs text-foreground/70 leading-relaxed">{caseStudy.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
