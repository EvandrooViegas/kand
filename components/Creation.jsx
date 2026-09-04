'use client'

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2, Sparkles, Lightbulb, Check, RefreshCw,
  LayoutTemplate, Image as ImageIcon, ChevronDown, ChevronUp,
  Users, Target, Eye, BookOpen, PenLine, ArrowLeft,
  Hash, FileText, MessageSquare, AlertCircle, Layers, Trash2,
  Boxes, Upload, Wand2, Ban, Tag, Search, ExternalLink
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms))

const PILLAR_COLORS = {
  'Educational':            'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  'Expertise':              'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  'Services':               'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  'Projects / Cases':       'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  'Company':                'bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300',
  'Behind the scenes':      'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  'Industry insights':      'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',
  'Problems and solutions': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  'Trust / Credibility':    'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',
  'Brand positioning':      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

const getPillarColor = p =>
  PILLAR_COLORS[p] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'

// ─── IdeaCard ─────────────────────────────────────────────────────────────────

function IdeaCard({ idea, selected, onToggle }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className={`relative rounded-xl border-2 transition-all duration-200 overflow-hidden
      ${selected
        ? 'border-primary bg-primary/5 dark:bg-primary/10'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'
      }`}>
      <button
        onClick={onToggle}
        className={`absolute top-4 right-4 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors z-10
          ${selected ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 dark:border-slate-600 hover:border-primary'}`}
        aria-label={selected ? 'Deselect' : 'Select'}
      >
        {selected && <Check className="w-3.5 h-3.5" />}
      </button>

      <div className="p-5 pr-14">
        <div className="flex items-start gap-3 mb-3">
          <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
            <Lightbulb className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap gap-2 mb-2">
              <Badge className={`text-xs font-medium ${getPillarColor(idea.pillar)}`}>{idea.pillar}</Badge>
              <Badge variant="outline" className="text-xs gap-1">
                {idea.format === 'carousel'
                  ? <><LayoutTemplate className="w-3 h-3" /> Carousel</>
                  : <><ImageIcon className="w-3 h-3" /> Single</>}
              </Badge>
            </div>
            <h3 className="font-semibold text-sm leading-snug text-slate-900 dark:text-slate-100">{idea.topic}</h3>
          </div>
        </div>

        <blockquote className="border-l-2 border-primary/50 pl-3 mb-3">
          <p className="text-sm text-slate-600 dark:text-slate-400 italic">"{idea.hook}"</p>
        </blockquote>

        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed mb-3">{idea.coreMessage}</p>

        <button onClick={() => setExpanded(v => !v)}
          className="flex items-center gap-1.5 text-xs text-primary hover:underline font-medium">
          {expanded ? <><ChevronUp className="w-3.5 h-3.5" />Hide details</> : <><ChevronDown className="w-3.5 h-3.5" />Show details</>}
        </button>

        {expanded && (
          <div className="mt-4 space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            {[
              { icon: Target, label: 'Objective', val: idea.objective },
              { icon: Users,  label: 'Target audience', val: idea.targetAudience },
              { icon: Eye,    label: 'Visual direction', val: idea.visualDirection },
            ].map(({ icon: Icon, label, val }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300">{val}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── SlideRow ─────────────────────────────────────────────────────────────────

function SlideRow({ slide }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
            {slide.slideNumber}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{slide.headline}</span>
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">{slide.purpose}</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-4 pt-1 space-y-3 border-t border-slate-100 dark:border-slate-800">
          {slide.body && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Body</p>
              <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line">{slide.body}</p>
            </div>
          )}
          {slide.cta && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">CTA</p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{slide.cta}</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── CopyCard ─────────────────────────────────────────────────────────────────

function CopyCard({ idea, copy, loading, error }) {
  const isCarousel = idea.format === 'carousel'
  return (
    <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
          <PenLine className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge className={`text-xs font-medium ${getPillarColor(idea.pillar)}`}>{idea.pillar}</Badge>
            <Badge variant="outline" className="text-xs gap-1">
              {isCarousel ? <><LayoutTemplate className="w-3 h-3" />Carousel</> : <><ImageIcon className="w-3 h-3" />Single</>}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{idea.topic}</p>
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Writing copy…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && copy && (
          <div className="space-y-5">
            {!isCarousel && (
              <div className="space-y-4">
                {copy.headline && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5" />Headline
                    </p>
                    <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{copy.headline}</p>
                  </div>
                )}
                {copy.subheadline && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Subheadline</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{copy.subheadline}</p>
                  </div>
                )}
                {copy.supportingText && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Supporting text</p>
                    <p className="text-sm text-slate-700 dark:text-slate-300">{copy.supportingText}</p>
                  </div>
                )}
                {copy.cta && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">CTA</p>
                    <p className="text-sm font-medium text-primary">{copy.cta}</p>
                  </div>
                )}
              </div>
            )}

            {isCarousel && Array.isArray(copy.slides) && copy.slides.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5" />{copy.slides.length} Slides
                </p>
                <div className="space-y-2">
                  {copy.slides.map(slide => <SlideRow key={slide.slideNumber} slide={slide} />)}
                </div>
              </div>
            )}

            {copy.caption && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5" />Caption
                </p>
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{copy.caption}</p>
              </div>
            )}

            {Array.isArray(copy.hashtags) && copy.hashtags.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Hash className="w-3.5 h-3.5" />Hashtags
                </p>
                <div className="flex flex-wrap gap-2">
                  {copy.hashtags.map((tag, i) => (
                    <span key={i} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md font-mono">
                      {tag.startsWith('#') ? tag : `#${tag}`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {Array.isArray(copy.visualNotes) && copy.visualNotes.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5" />Visual notes
                </p>
                <ul className="space-y-1">
                  {copy.visualNotes.map((note, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2">
                      <span className="text-primary mt-0.5">·</span>{note}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AssetPlanCard ────────────────────────────────────────────────────────────

const SOURCE_META = {
  uploaded_asset: { label: 'Uploaded asset', icon: Upload,  cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
  unsplash:       { label: 'Unsplash',        icon: Search,  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' },
  ai_generated:   { label: 'AI generated',   icon: Wand2,   cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  none:           { label: 'No image',        icon: Ban,     cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400' },
}

function SlotCard({ slot }) {
  const [open, setOpen] = useState(false)
  const src = SOURCE_META[slot.preferred_source] ?? SOURCE_META.none
  const SrcIcon = src.icon

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
            {slot.slot_id.replace(/[^0-9]/g, '') || '·'}
          </span>
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{slot.slot_label}</span>
          <Badge className={`text-xs gap-1 shrink-0 ${src.cls}`}>
            <SrcIcon className="w-3 h-3" />{src.label}
          </Badge>
          {!slot.needs_visual && (
            <Badge variant="outline" className="text-xs shrink-0">Typography only</Badge>
          )}
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />}
      </button>

      {open && (
        <div className="px-4 pb-4 pt-1 space-y-4 border-t border-slate-100 dark:border-slate-800">
          {/* Purpose */}
          {slot.visual_purpose && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />Visual purpose
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-300">{slot.visual_purpose}</p>
            </div>
          )}

          {/* Source reason */}
          {slot.source_reason && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Source rationale</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 italic">{slot.source_reason}</p>
            </div>
          )}

          {/* Search keywords */}
          {slot.search_keywords?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5" />Search keywords
              </p>
              <div className="flex flex-wrap gap-1.5">
                {slot.search_keywords.map(k => (
                  <span key={k} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded font-mono">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Matched uploaded assets */}
          {slot.candidates?.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Boxes className="w-3.5 h-3.5" />Matched assets ({slot.candidates.length})
              </p>
              <div className="flex gap-3 flex-wrap">
                {slot.candidates.map((c, i) => (
                  <div key={c.asset_id}
                    className={`relative rounded-lg overflow-hidden border-2 w-20 h-20 flex-shrink-0 transition-all
                      ${i === 0 ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200 dark:border-slate-700'}`}>
                    <img src={c.thumbnail_url || c.url} alt={c.filename}
                      className="w-full h-full object-cover" />
                    <div className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1 py-0.5 font-mono">
                      {Math.round(c.score * 100)}%
                    </div>
                    {i === 0 && (
                      <div className="absolute top-1 left-1 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-2.5 h-2.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1.5">Checkmark = selected for Canvas Designer · Score = tag match %</p>
            </div>
          )}

          {/* No match */}
          {slot.preferred_source === 'uploaded_asset' && slot.candidates?.length === 0 && (
            <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700 dark:text-amber-300">
                No matching uploaded assets found. Upload relevant images in the Gallery tab.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AssetPlanCard({ idea, plan, loading, error }) {
  const isCarousel = idea.format === 'carousel'
  const slotsWithVisual = plan?.slots?.filter(s => s.needs_visual) ?? []

  return (
    <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
          <Boxes className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge className={`text-xs font-medium ${getPillarColor(idea.pillar)}`}>{idea.pillar}</Badge>
            <Badge variant="outline" className="text-xs gap-1">
              {isCarousel ? <><LayoutTemplate className="w-3 h-3" />Carousel</> : <><ImageIcon className="w-3 h-3" />Single</>}
            </Badge>
            {plan && (
              <Badge variant="secondary" className="text-xs">
                {slotsWithVisual.length}/{plan.slots.length} slots need visuals
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{idea.topic}</p>
        </div>
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Planning assets…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && plan && (
          <div className="space-y-2">
            {plan.slots.map(slot => (
              <SlotCard key={slot.slot_id} slot={slot} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ResolvedPlanCard ─────────────────────────────────────────────────────────

const RESOLVED_SOURCE_META = {
  uploaded_asset: { label: 'Uploaded',    cls: 'bg-green-100  text-green-700  dark:bg-green-900/40  dark:text-green-300'  },
  unsplash:       { label: 'Unsplash',    cls: 'bg-blue-100   text-blue-700   dark:bg-blue-900/40   dark:text-blue-300'   },
  ai_generated:   { label: 'AI generated', cls: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' },
  none:           { label: 'No image',    cls: 'bg-slate-100  text-slate-600  dark:bg-slate-800     dark:text-slate-400'  },
}

function ResolvedSlotRow({ slot, onRetry }) {
  const meta = RESOLVED_SOURCE_META[slot.source] ?? RESOLVED_SOURCE_META.none
  const asset = slot.resolvedAsset
  const canRetry = slot.needs_visual && (!asset || slot.warning)

  return (
    <div className="flex items-start gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
      {/* Thumbnail */}
      <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center">
        {asset?.thumbnail_url || asset?.url ? (
          <img
            src={asset.thumbnail_url || asset.url}
            alt={asset.alt || slot.slot_label}
            className="w-full h-full object-cover"
          />
        ) : (
          <Ban className="w-7 h-7 text-slate-300" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{slot.slot_label}</span>
          <Badge className={`text-xs ${meta.cls}`}>{meta.label}</Badge>
          {!slot.needs_visual && <Badge variant="outline" className="text-xs">Typography only</Badge>}
          {asset && (
            <Badge variant="secondary" className="text-xs font-mono">
              {asset.width && asset.height ? `${asset.width}×${asset.height}` : 'unknown size'}
            </Badge>
          )}
        </div>

        {slot.visual_purpose && (
          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{slot.visual_purpose}</p>
        )}

        {slot.warning && (
          <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            {slot.warning}
          </div>
        )}

        {asset?.url && (
          <a
            href={asset.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-primary hover:underline truncate block"
          >
            {asset.url.length > 72 ? asset.url.slice(0, 72) + '…' : asset.url}
          </a>
        )}

        {!asset && slot.needs_visual && !slot.warning && (
          <p className="text-xs text-slate-400 italic">No asset resolved</p>
        )}
      </div>

      {/* Per-slot retry when something went wrong */}
      {canRetry && (
        <button
          onClick={onRetry}
          className="flex-shrink-0 flex items-center gap-1 text-xs text-slate-500 hover:text-primary transition-colors px-2 py-1 rounded-md hover:bg-primary/5 border border-slate-200 dark:border-slate-700"
          title="Retry resolving this post's assets"
        >
          <RefreshCw className="w-3 h-3" />
          Retry
        </button>
      )}
    </div>
  )
}

function ResolvedPlanCard({ idea, resolved, loading, error, onRetry }) {
  const isCarousel = idea.format === 'carousel'
  const resolvedSlots = resolved?.slots ?? []
  const withAsset     = resolvedSlots.filter(s => s.resolvedAsset).length
  const warnings      = resolvedSlots.filter(s => s.warning).length

  return (
    <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
          <ImageIcon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge className={`text-xs font-medium ${getPillarColor(idea.pillar)}`}>{idea.pillar}</Badge>
            <Badge variant="outline" className="text-xs gap-1">
              {isCarousel ? <><LayoutTemplate className="w-3 h-3" />Carousel</> : <><ImageIcon className="w-3 h-3" />Single</>}
            </Badge>
            {resolved && (
              <Badge variant="secondary" className="text-xs">
                {withAsset}/{resolvedSlots.length} assets resolved
              </Badge>
            )}
            {warnings > 0 && (
              <Badge variant="outline" className="text-xs text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-700">
                {warnings} warning{warnings > 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{idea.topic}</p>
        </div>
        {/* Per-card retry — always available when not loading */}
        {!loading && (
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0 h-8 text-xs"
            onClick={onRetry}
          >
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" />Retry
          </Button>
        )}
      </div>

      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Resolving assets…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && resolved && (
          <div className="space-y-3">
            {resolvedSlots.map(slot => (
              <ResolvedSlotRow key={slot.slot_id} slot={slot} onRetry={onRetry} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CanvasDesignCard ─────────────────────────────────────────────────────────

function CanvasDesignCard({ idea, canvas, loading, error, onRetry }) {
  const isCarousel = idea.format === 'carousel'
  const pageCount  = canvas?.pages?.length ?? 0
  const canvasId   = canvas?.id

  return (
    <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-2 mb-1">
            <Badge className={`text-xs font-medium ${
              { 'Educational': 'bg-blue-100 text-blue-700',
                'Expertise': 'bg-purple-100 text-purple-700',
                'Services': 'bg-green-100 text-green-700',
              }[idea.pillar] ?? 'bg-slate-100 text-slate-700'
            }`}>{idea.pillar}</Badge>
            <Badge variant="outline" className="text-xs gap-1">
              {isCarousel ? <><LayoutTemplate className="w-3 h-3" />Carousel</> : <><ImageIcon className="w-3 h-3" />Single</>}
            </Badge>
            {canvas && (
              <Badge variant="secondary" className="text-xs">
                {isCarousel ? `${pageCount} slides` : '1 canvas'}
              </Badge>
            )}
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{idea.topic}</p>
        </div>
        {!loading && (
          <div className="flex gap-2 flex-shrink-0">
            {canvasId && (
              <a
                href={isCarousel ? `/carousel/${canvasId}` : `/editor/${canvasId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button size="sm" variant="default" className="h-8 text-xs gap-1.5">
                  <ExternalLink className="w-3.5 h-3.5" />Open in editor
                </Button>
              </a>
            )}
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onRetry}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />Retry
            </Button>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="p-5">
        {loading && (
          <div className="flex items-center gap-3 py-6 justify-center text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin text-primary" />
            <span className="text-sm">Designing canvas…</span>
          </div>
        )}

        {!loading && error && (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        )}

        {!loading && !error && canvas && (
          <div className="space-y-4">
            {/* Canvas meta */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 mb-1">Format</p>
                <p className="text-sm font-semibold capitalize">{canvas.type}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 mb-1">Dimensions</p>
                <p className="text-sm font-semibold">{canvas.width}×{canvas.height}</p>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3">
                <p className="text-xs text-slate-500 mb-1">Slides</p>
                <p className="text-sm font-semibold">{isCarousel ? pageCount : 1}</p>
              </div>
            </div>

            {/* Slide layout summary */}
            {isCarousel && canvas.pages?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Slide layouts</p>
                <div className="space-y-1.5">
                  {canvas.pages.map((page, i) => {
                    const nodeTypes = [...new Set((page.nodes || []).map(n => n.type))]
                    const hasImage  = nodeTypes.includes('image')
                    const typeLabel = { top_peer: 'Cover', content: `Slide ${i}`, bottom_peer: 'CTA' }[page.type] ?? page.name
                    return (
                      <div key={page.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                        <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-[10px]">
                          {i + 1}
                        </span>
                        <span className="font-medium">{typeLabel}</span>
                        <span className="text-slate-400">·</span>
                        <span>{(page.nodes || []).length} nodes</span>
                        {hasImage && <Badge variant="outline" className="text-[10px] py-0 px-1.5">image</Badge>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Single canvas node summary */}
            {!isCarousel && (
              <div className="flex items-center gap-3 text-xs text-slate-500">
                <span>{(canvas.nodes || []).length} nodes</span>
                {(canvas.nodes || []).some(n => n.type === 'image') && (
                  <Badge variant="outline" className="text-[10px] py-0 px-1.5">image</Badge>
                )}
              </div>
            )}

            {/* Canvas ID for API use */}
            <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
              <p className="text-xs text-slate-500 flex-shrink-0">Canvas ID</p>
              <p className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate flex-1">{canvasId}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── StepPill ────────────────────────────────────────────────────────────────

function StepPill({ active, done, icon: Icon, label, onClick }) {
  return (
    <button
      onClick={onClick}
      disabled={!done && !active}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors
        ${active ? 'bg-primary text-primary-foreground' : done ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}
    >
      <Icon className="w-3.5 h-3.5" />{label}
    </button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Creation({ flowId, brandContext }) {
  const [ideas, setIdeas]             = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [copyResults, setCopyResults]       = useState({})   // ideaId → { loading, error, copy }
  const [planResults, setPlanResults]       = useState({})   // ideaId → { loading, error, plan }
  const [resolveResults, setResolveResults] = useState({})   // ideaId → { loading, error, resolved }
  const [designResults, setDesignResults]   = useState({})   // ideaId → { loading, error, canvas }
  const [step, setStep]               = useState('ideas')
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [copyingInProgress, setCopyingInProgress]     = useState(false)
  const [planningInProgress, setPlanningInProgress]   = useState(false)
  const [resolvingInProgress, setResolvingInProgress] = useState(false)
  const [designingInProgress, setDesigningInProgress] = useState(false)
  const [initialising, setInitialising] = useState(true)

  const hasBrand = !!(brandContext?.name || brandContext?.about)
  const selectedIdeas = ideas.filter(i => selectedIds.has(i.id))
  const brandId = flowId ? `brand_${flowId}` : null

  // ── Persist to flow ────────────────────────────────────────────────────────

  const persistToFlow = useCallback(async (newIdeas, newCopyResults, newPlanResults, newResolveResults, newDesignResults) => {
    if (!flowId) return
    try {
      await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationState: {
            ideas: newIdeas,
            copyResults: newCopyResults,
            planResults: newPlanResults,
            resolveResults: newResolveResults,
            designResults: newDesignResults,
          }
        }),
      })
    } catch (e) {
      console.warn('Failed to persist creation state', e)
    }
  }, [flowId])

  // ── Load persisted state on mount ─────────────────────────────────────────

  useEffect(() => {
    if (!flowId) { setInitialising(false); return }
    fetch(`/api/flows/${flowId}`)
      .then(r => r.json())
      .then(flow => {
        const saved = flow?.creationState
        if (saved?.ideas?.length) {
          setIdeas(saved.ideas)
          setCopyResults(saved.copyResults || {})
          setPlanResults(saved.planResults || {})
          setResolveResults(saved.resolveResults || {})
          setDesignResults(saved.designResults || {})
          // Restore step: land on furthest completed step
          const hasDesign   = Object.keys(saved.designResults  || {}).length > 0
          const hasResolved = Object.keys(saved.resolveResults || {}).length > 0
          const hasPlan     = Object.keys(saved.planResults    || {}).length > 0
          const hasCopy     = Object.keys(saved.copyResults    || {}).length > 0
          if (hasDesign)     setStep('design')
          else if (hasResolved)   setStep('resolve')
          else if (hasPlan)  setStep('plan')
          else if (hasCopy)  setStep('copy')
        }
      })
      .catch(() => {})
      .finally(() => setInitialising(false))
  }, [flowId])

  // ── Step 1: generate ideas ─────────────────────────────────────────────────

  const generateIdeas = async () => {
    if (!hasBrand) { toast.error('Please save brand information first'); return }
    setLoadingIdeas(true)
    setIdeas([])
    setSelectedIds(new Set())
    setCopyResults({})
    try {
      const res = await fetch('/api/generate-content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandContext }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to generate ideas')
      if (!Array.isArray(data.ideas) || data.ideas.length === 0) throw new Error('No ideas returned')
      setIdeas(data.ideas)
      await persistToFlow(data.ideas, {}, {}, {})
      toast.success(`${data.ideas.length} content ideas generated`)
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoadingIdeas(false)
    }
  }

  const toggleIdea = id => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === ideas.length ? new Set() : new Set(ideas.map(i => i.id)))

  const clearIdeas = async () => {
    setIdeas([])
    setSelectedIds(new Set())
    setCopyResults({})
    setPlanResults({})
    setResolveResults({})
    setDesignResults({})
    setStep('ideas')
    await persistToFlow([], {}, {}, {}, {})
    toast.success('Ideas cleared')
  }

  // ── Step 2: generate copy — sequential with retry ─────────────────────────

  const generateCopy = async () => {
    if (selectedIdeas.length === 0) { toast.error('Select at least one idea'); return }
    setCopyingInProgress(true)

    // Mark all as loading
    const initial = {}
    selectedIdeas.forEach(idea => { initial[idea.id] = { loading: true, error: null, copy: null } })
    setCopyResults(prev => ({ ...prev, ...initial }))
    setStep('copy')

    const updatedResults = { ...copyResults, ...initial }

    for (const idea of selectedIdeas) {
      let result = { loading: false, error: null, copy: null }

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const res = await fetch('/api/generate-copywriting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandContext, idea }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed')
          result = { loading: false, error: null, copy: data }
          break
        } catch (err) {
          const is429 = err?.message?.includes('429') || err?.message?.includes('rate_limit')
          if (is429 && attempt < 2) {
            toast.info(`Rate limit hit — waiting 15s before retrying "${idea.topic.slice(0, 40)}…"`)
            await sleep(15000)
            continue
          }
          result = { loading: false, error: err.message, copy: null }
          break
        }
      }

      updatedResults[idea.id] = result
      setCopyResults({ ...updatedResults })

      // 2s gap between ideas to stay within TPM
      if (idea !== selectedIdeas[selectedIdeas.length - 1]) await sleep(2000)
    }

    await persistToFlow(ideas, updatedResults, planResults, resolveResults, designResults)
    setCopyingInProgress(false)
    toast.success('Copywriting complete')
  }

  // ── Step 3: plan assets for each post with copy ───────────────────────────

  const generatePlans = async () => {
    // Plan for all ideas that have completed copy — not just currently selected ones
    const ideasWithCopy = ideas.filter(i => copyResults[i.id]?.copy)
    if (ideasWithCopy.length === 0) { toast.error('Generate copy first'); return }

    setPlanningInProgress(true)
    const initial = {}
    ideasWithCopy.forEach(i => { initial[i.id] = { loading: true, error: null, plan: null } })
    setPlanResults(prev => ({ ...prev, ...initial }))
    setStep('plan')

    const updatedPlans = { ...planResults, ...initial }

    for (const idea of ideasWithCopy) {
      let result = { loading: false, error: null, plan: null }
      try {
        const res = await fetch('/api/plan-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandContext,
            copy:     copyResults[idea.id].copy,
            idea,
            brand_id: brandId,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        result = { loading: false, error: null, plan: data }
      } catch (err) {
        result = { loading: false, error: err.message, plan: null }
      }

      updatedPlans[idea.id] = result
      setPlanResults({ ...updatedPlans })

      if (idea !== ideasWithCopy[ideasWithCopy.length - 1]) await sleep(2000)
    }

    await persistToFlow(ideas, copyResults, updatedPlans, resolveResults, designResults)
    setPlanningInProgress(false)
    toast.success('Asset planning complete')
  }

  // ── Step 4: resolve assets ────────────────────────────────────────────────

  const resolveAssets = async () => {
    const ideasWithPlan = ideas.filter(i => planResults[i.id]?.plan)
    if (ideasWithPlan.length === 0) { toast.error('Plan assets first'); return }

    setResolvingInProgress(true)
    const initial = {}
    ideasWithPlan.forEach(i => { initial[i.id] = { loading: true, error: null, resolved: null } })
    setResolveResults(prev => ({ ...prev, ...initial }))
    setStep('resolve')

    const updatedResolved = { ...resolveResults, ...initial }

    for (const idea of ideasWithPlan) {
      let result = { loading: false, error: null, resolved: null }
      try {
        const res = await fetch('/api/resolve-assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            plan:     planResults[idea.id].plan,
            brand_id: brandId,
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        result = { loading: false, error: null, resolved: data }
      } catch (err) {
        result = { loading: false, error: err.message, resolved: null }
      }

      updatedResolved[idea.id] = result
      setResolveResults({ ...updatedResolved })

      if (idea !== ideasWithPlan[ideasWithPlan.length - 1]) await sleep(500)
    }

    await persistToFlow(ideas, copyResults, planResults, updatedResolved, designResults)
    setResolvingInProgress(false)
    toast.success('Assets resolved')
  }

  const retryResolveOne = async (idea) => {
    if (!planResults[idea.id]?.plan) { toast.error('No asset plan for this post'); return }

    setResolveResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, resolved: null } }))

    let result = { loading: false, error: null, resolved: null }
    try {
      const res = await fetch('/api/resolve-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan:     planResults[idea.id].plan,
          brand_id: brandId,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      result = { loading: false, error: null, resolved: data }
      toast.success('Assets resolved')
    } catch (err) {
      result = { loading: false, error: err.message, resolved: null }
      toast.error(err.message || 'Retry failed')
    }

    setResolveResults(prev => {
      const updated = { ...prev, [idea.id]: result }
      persistToFlow(ideas, copyResults, planResults, updated, designResults)
      return updated
    })
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (initialising) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  // ── Step 5: design canvas ─────────────────────────────────────────────────

  const designCanvases = async () => {
    const ideasWithResolved = ideas.filter(i => resolveResults[i.id]?.resolved)
    if (ideasWithResolved.length === 0) { toast.error('Resolve assets first'); return }

    setDesigningInProgress(true)
    const initial = {}
    ideasWithResolved.forEach(i => { initial[i.id] = { loading: true, error: null, canvas: null } })
    setDesignResults(prev => ({ ...prev, ...initial }))
    setStep('design')

    const updatedDesigns = { ...designResults, ...initial }

    for (const idea of ideasWithResolved) {
      let result = { loading: false, error: null, canvas: null }
      try {
        const res = await fetch('/api/design-canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandContext,
            copy:         copyResults[idea.id].copy,
            resolvedPlan: resolveResults[idea.id].resolved,
            canvasName:   `${brandContext?.name ?? ''} — ${idea.topic}`.trim(),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        result = { loading: false, error: null, canvas: data }
      } catch (err) {
        result = { loading: false, error: err.message, canvas: null }
      }

      updatedDesigns[idea.id] = result
      setDesignResults({ ...updatedDesigns })

      if (idea !== ideasWithResolved[ideasWithResolved.length - 1]) await sleep(1000)
    }

    await persistToFlow(ideas, copyResults, planResults, resolveResults, updatedDesigns)
    setDesigningInProgress(false)
    toast.success('Canvas design complete')
  }

  const retryDesignOne = async (idea) => {
    if (!resolveResults[idea.id]?.resolved) { toast.error('No resolved assets for this post'); return }

    setDesignResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, canvas: null } }))

    let result = { loading: false, error: null, canvas: null }
    try {
      const res = await fetch('/api/design-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext,
          copy:         copyResults[idea.id].copy,
          resolvedPlan: resolveResults[idea.id].resolved,
          canvasName:   `${brandContext?.name ?? ''} — ${idea.topic}`.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      result = { loading: false, error: null, canvas: data }
      toast.success('Canvas designed')
    } catch (err) {
      result = { loading: false, error: err.message, canvas: null }
      toast.error(err.message || 'Retry failed')
    }

    setDesignResults(prev => {
      const updated = { ...prev, [idea.id]: result }
      persistToFlow(ideas, copyResults, planResults, resolveResults, updated)
      return updated
    })
  }

  const hasCopyResults    = Object.keys(copyResults).length > 0
  const hasPlanResults    = Object.keys(planResults).length > 0
  const hasResolveResults = Object.keys(resolveResults).length > 0
  const hasDesignResults  = Object.keys(designResults).length > 0

  return (
    <div className="space-y-8">

      {/* ── Step navigator ── */}
      <div className="flex items-center gap-2">
        <StepPill
          active={step === 'ideas'}
          done={ideas.length > 0}
          icon={Lightbulb}
          label="1 — Content Ideas"
          onClick={() => setStep('ideas')}
        />
        <div className="h-px w-6 bg-slate-300 dark:bg-slate-600" />
        <StepPill
          active={step === 'copy'}
          done={hasCopyResults}
          icon={PenLine}
          label="2 — Copywriting"
          onClick={() => hasCopyResults && setStep('copy')}
        />
        <div className="h-px w-6 bg-slate-300 dark:bg-slate-600" />
        <StepPill
          active={step === 'plan'}
          done={hasPlanResults}
          icon={Boxes}
          label="3 — Asset Planner"
          onClick={() => hasPlanResults && setStep('plan')}
        />
        <div className="h-px w-6 bg-slate-300 dark:bg-slate-600" />
        <StepPill
          active={step === 'resolve'}
          done={hasResolveResults}
          icon={ImageIcon}
          label="4 — Asset Resolver"
          onClick={() => hasResolveResults && setStep('resolve')}
        />
        <div className="h-px w-6 bg-slate-300 dark:bg-slate-600" />
        <StepPill
          active={step === 'design'}
          done={hasDesignResults}
          icon={Sparkles}
          label="5 — Canvas Designer"
          onClick={() => hasDesignResults && setStep('design')}
        />
      </div>

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 1 — IDEAS                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'ideas' && (
        <>
          <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
            <CardHeader>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Sparkles className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Content Ideas</CardTitle>
                  <CardDescription>Generate 10 Instagram content briefs based on your brand information</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!hasBrand ? (
                <div className="flex items-start gap-3 mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <BookOpen className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    No brand information found. Go to the <strong>Brand Information</strong> tab first.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
                  <Check className="w-4 h-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                  <p className="text-sm text-green-700 dark:text-green-300">
                    Brand loaded: <strong>{brandContext.name}</strong>
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button onClick={generateIdeas} disabled={loadingIdeas || !hasBrand} size="lg" className="flex-1">
                  {loadingIdeas
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                    : ideas.length > 0
                      ? <><RefreshCw className="w-4 h-4 mr-2" />Regenerate ideas</>
                      : <><Sparkles className="w-4 h-4 mr-2" />Generate content ideas</>
                  }
                </Button>
                {ideas.length > 0 && (
                  <Button variant="outline" size="lg" onClick={clearIdeas} className="text-destructive hover:bg-destructive/10">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {ideas.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100">{ideas.length} ideas</h3>
                  {selectedIds.size > 0 && <Badge variant="secondary">{selectedIds.size} selected</Badge>}
                </div>
                <button onClick={toggleAll} className="text-sm text-primary hover:underline font-medium">
                  {selectedIds.size === ideas.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {ideas.map(idea => (
                  <IdeaCard key={idea.id} idea={idea} selected={selectedIds.has(idea.id)} onToggle={() => toggleIdea(idea.id)} />
                ))}
              </div>

              {selectedIds.size > 0 && (
                <div className="sticky bottom-6 z-10">
                  <div className="rounded-xl border-2 border-primary bg-white dark:bg-slate-950 shadow-lg p-4 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-sm">
                        {selectedIds.size} idea{selectedIds.size > 1 ? 's' : ''} selected
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedIdeas.map(i => i.pillar).join(' · ')}
                      </p>
                    </div>
                    <Button size="sm" className="shrink-0" onClick={generateCopy} disabled={copyingInProgress}>
                      {copyingInProgress
                        ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Writing…</>
                        : <><PenLine className="w-4 h-4 mr-2" />Write copy</>
                      }
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 2 — COPYWRITING                                                  */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'copy' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Copywriting — {Object.keys(copyResults).length} post{Object.keys(copyResults).length !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {copyingInProgress ? 'Generating copy one post at a time…' : 'Copy generated for each selected idea'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep('ideas')}>
              <ArrowLeft className="w-4 h-4 mr-2" />Back to ideas
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {ideas
              .filter(idea => copyResults[idea.id])
              .map(idea => {
                const state = copyResults[idea.id]
                return (
                  <CopyCard
                    key={idea.id}
                    idea={idea}
                    copy={state.copy}
                    loading={state.loading}
                    error={state.error}
                  />
                )
              })}
          </div>

          {/* Sticky CTA to proceed to asset planning */}
          {hasCopyResults && !copyingInProgress && (
            <div className="sticky bottom-6 z-10">
              <div className="rounded-xl border-2 border-primary bg-white dark:bg-slate-950 shadow-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">Copy ready</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Plan visual assets for each post</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={generatePlans} disabled={planningInProgress}>
                  {planningInProgress
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Planning…</>
                    : <><Boxes className="w-4 h-4 mr-2" />Plan assets</>
                  }
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 3 — ASSET PLANNER                                                */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'plan' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Asset Planner — {Object.keys(planResults).length} post{Object.keys(planResults).length !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {planningInProgress ? 'Analysing visual requirements…' : 'Visual asset requirements per post'}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setStep('copy')}>
              <ArrowLeft className="w-4 h-4 mr-2" />Back to copy
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {ideas
              .filter(idea => planResults[idea.id])
              .map(idea => {
                const state = planResults[idea.id]
                return (
                  <AssetPlanCard
                    key={idea.id}
                    idea={idea}
                    plan={state.plan}
                    loading={state.loading}
                    error={state.error}
                  />
                )
              })}
          </div>

          {/* Sticky CTA to proceed to asset resolution */}
          {hasPlanResults && !planningInProgress && (
            <div className="sticky bottom-6 z-10">
              <div className="rounded-xl border-2 border-primary bg-white dark:bg-slate-950 shadow-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">Asset plan ready</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Fetch real images for every visual slot</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={resolveAssets} disabled={resolvingInProgress}>
                  {resolvingInProgress
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Resolving…</>
                    : <><ImageIcon className="w-4 h-4 mr-2" />Resolve assets</>
                  }
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 4 — ASSET RESOLVER                                               */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'resolve' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Asset Resolver — {Object.keys(resolveResults).length} post{Object.keys(resolveResults).length !== 1 ? 's' : ''}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {resolvingInProgress ? 'Fetching images from library, Unsplash, and AI…' : 'Resolved assets ready for Canvas Designer'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('plan')}>
                <ArrowLeft className="w-4 h-4 mr-2" />Back to plan
              </Button>
              {hasResolveResults && !resolvingInProgress && (
                <Button variant="outline" size="sm" onClick={resolveAssets}>
                  <RefreshCw className="w-4 h-4 mr-2" />Re-resolve
                </Button>
              )}            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {ideas
              .filter(idea => resolveResults[idea.id])
              .map(idea => {
                const state = resolveResults[idea.id]
                return (
                  <ResolvedPlanCard
                    key={idea.id}
                    idea={idea}
                    resolved={state.resolved}
                    loading={state.loading}
                    error={state.error}
                    onRetry={() => retryResolveOne(idea)}
                  />
                )
              })}
          </div>

          {/* Sticky CTA to proceed to canvas design */}
          {hasResolveResults && !resolvingInProgress && (
            <div className="sticky bottom-6 z-10">
              <div className="rounded-xl border-2 border-primary bg-white dark:bg-slate-950 shadow-lg p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold text-sm">Assets resolved</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Generate Instagram canvas layouts</p>
                </div>
                <Button size="sm" className="shrink-0" onClick={designCanvases} disabled={designingInProgress}>
                  {designingInProgress
                    ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Designing…</>
                    : <><Sparkles className="w-4 h-4 mr-2" />Design canvas</>
                  }
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* STEP 5 — CANVAS DESIGNER                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {step === 'design' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">
                Canvas Designer — {Object.keys(designResults).length} canvas{Object.keys(designResults).length !== 1 ? 'es' : ''}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                {designingInProgress ? 'Generating layouts…' : 'Canvases ready — open in editor to refine'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setStep('resolve')}>
                <ArrowLeft className="w-4 h-4 mr-2" />Back
              </Button>
              {hasDesignResults && !designingInProgress && (
                <Button variant="outline" size="sm" onClick={designCanvases}>
                  <RefreshCw className="w-4 h-4 mr-2" />Re-design all
                </Button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {ideas
              .filter(idea => designResults[idea.id])
              .map(idea => {
                const state = designResults[idea.id]
                return (
                  <CanvasDesignCard
                    key={idea.id}
                    idea={idea}
                    canvas={state.canvas}
                    loading={state.loading}
                    error={state.error}
                    onRetry={() => retryDesignOne(idea)}
                  />
                )
              })}
          </div>
        </>
      )}
    </div>
  )
}
