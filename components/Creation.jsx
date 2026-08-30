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
  Hash, FileText, MessageSquare, AlertCircle, Layers, Trash2
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
  const [copyResults, setCopyResults] = useState({})   // ideaId → { loading, error, copy }
  const [step, setStep]               = useState('ideas')
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [copyingInProgress, setCopyingInProgress] = useState(false)
  const [initialising, setInitialising] = useState(true)

  const hasBrand = !!(brandContext?.name || brandContext?.about)
  const selectedIdeas = ideas.filter(i => selectedIds.has(i.id))

  // ── Persist to flow ────────────────────────────────────────────────────────

  const persistToFlow = useCallback(async (newIdeas, newCopyResults) => {
    if (!flowId) return
    try {
      await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationState: {
            ideas: newIdeas,
            copyResults: newCopyResults,
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
          // Restore step: if any copy exists, land on copy step
          const hasCopy = Object.keys(saved.copyResults || {}).length > 0
          if (hasCopy) setStep('copy')
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
      await persistToFlow(data.ideas, {})
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
    setStep('ideas')
    await persistToFlow([], {})
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

    await persistToFlow(ideas, updatedResults)
    setCopyingInProgress(false)
    toast.success('Copywriting complete')
  }

  // ─────────────────────────────────────────────────────────────────────────────

  if (initialising) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  const hasCopyResults = Object.keys(copyResults).length > 0

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
        </>
      )}
    </div>
  )
}
