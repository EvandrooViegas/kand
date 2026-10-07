'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import ResolvedImagePreview from '@/components/ResolvedImagePreview'
import {
  Loader2, Sparkles, Lightbulb, Check, RefreshCw,
  LayoutTemplate, Image as ImageIcon, ChevronDown, ChevronUp,
  Users, Target, Eye, BookOpen, PenLine,
  Hash, FileText, MessageSquare, AlertCircle, Layers, Trash2,
  Boxes, Upload, Wand2, Ban, Tag, Search, ExternalLink,
  ArrowRight, CheckCircle2
} from 'lucide-react'

// ─── helpers ─────────────────────────────────────────────────────────────────

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

// ─── Sub-display components ───────────────────────────────────────────────────

function SlideRow({ slide }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
      <button onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
        <div className="flex items-center gap-3">
          <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center flex-shrink-0">
            {slide.slideNumber}
          </span>
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{slide.headline}</span>
          <Badge variant="outline" className="text-xs hidden sm:inline-flex">{slide.purpose}</Badge>
        </div>
        {open ? <ChevronUp className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
      </button>
      {open && (
        <div className="px-4 pb-3 pt-1 space-y-2 border-t border-slate-100 dark:border-slate-800">
          {slide.body && <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-line">{slide.body}</p>}
          {slide.cta && <p className="text-xs font-medium text-primary">→ {slide.cta}</p>}
        </div>
      )}
    </div>
  )
}

// ─── Post generation: PLAN → (VISUALS) → BUILD ────────────────────────────────

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Failed')
  return data
}

/**
 * One request per real stage. PLAN makes the post's single model call (copy + composition plan);
 * VISUALS runs only when the selected design study needs imagery; BUILD creates and validates the editable canvas.
 * With keepCopy, the existing copy is re-planned without a model call.
 */
async function runPostGeneration({ idea, brandContext, brandId, keepCopy, onStage, onCopy, onPlan, onResolve, onDesign }) {
  onStage('content')
  let planned
  try {
    planned = await postJson('/api/plan-post', { brandContext, flowId: brandContext?.id, idea, ...(keepCopy ? { copy: keepCopy } : {}) })
    onCopy({ loading: false, error: null, copy: planned.copy })
    onPlan({ loading: false, error: null, plan: planned.plan, layoutPlan: planned.plan.layoutPlan })
  } catch (err) { onPlan({ loading: false, error: err.message, plan: null }); throw err }

  let resolved
  if (planned.needsVisuals) {
    onStage('visuals')
    try { resolved = await postJson('/api/resolve-assets', { plan: planned.plan, brand_id: brandId }) }
    catch (err) { onResolve({ loading: false, error: err.message, resolved: null }); throw err }
  } else {
    // The studied design uses no imagery: no search or generation is requested.
    resolved = { designId: planned.plan.designId, layoutPlan: planned.plan.layoutPlan, post_id: planned.plan.post_id, format: planned.plan.format, slots: planned.plan.slots.map(s => ({ slot_id: s.slot_id, slot_label: s.slot_label, needs_visual: false, visual_purpose: '', source: 'none', resolvedAsset: null, warning: null })) }
  }
  onResolve({ loading: false, error: null, resolved, skipped: !planned.needsVisuals })
  // An empty OpenAI account blocks every AI image; say so instead of leaving it in the collapsed details.
  const credits = resolved.slots?.find(s => /no credits left/i.test(s.warning || ''))
  if (credits) toast.warning('The OpenAI account has no credits left (add credits at platform.openai.com → Billing). Images were generated with fal or Pollinations, or taken from stock, instead.', { duration: 12000 })

  onStage('build')
  try {
    const canvas = await postJson('/api/design-canvas', { brandContext, copy: planned.copy, resolvedPlan: resolved, canvasName: `${brandContext?.name ?? ''} — ${idea.topic}`.trim() })
    onDesign({ loading: false, error: null, canvas })
    return canvas
  } catch (err) { onDesign({ loading: false, error: err.message, canvas: null }); throw err }
}

function PostPipelineCard({
  idea, brandContext, brandId,
  copyState, planState, resolveState, designState,
  onCopyDone, onPlanDone, onResolveDone, onDesignDone,
}) {
  const [stage, setStage] = useState(null)
  const [failedStage, setFailedStage] = useState(null)
  const [showDetails, setShowDetails] = useState(false)
  const lock = useRef(false)

  const copy     = copyState?.copy        ?? null
  const plan     = planState?.plan        ?? null
  const resolved = resolveState?.resolved ?? null
  const canvas   = designState?.canvas    ?? null
  const error    = copyState?.error || planState?.error || resolveState?.error || designState?.error || null
  const running  = !!stage
  const needsVisuals = plan ? plan.slots.some(s => s.needs_visual) : null

  const generate = async ({ keepCopy = null } = {}) => {
    if (lock.current) return
    lock.current = true
    setFailedStage(null)
    if (!keepCopy) onCopyDone(idea.id, { loading: false, error: null, copy: null })
    onPlanDone(idea.id, { loading: false, error: null, plan: null })
    onResolveDone(idea.id, { loading: false, error: null, resolved: null })
    onDesignDone(idea.id, { loading: false, error: null, canvas: null })
    let current = 'content'
    try {
      await runPostGeneration({
        idea, brandContext, brandId, keepCopy,
        onStage: s => { current = s; setStage(s) },
        onCopy: v => onCopyDone(idea.id, v), onPlan: v => onPlanDone(idea.id, v),
        onResolve: v => onResolveDone(idea.id, v), onDesign: v => onDesignDone(idea.id, v),
      })
      toast.success('Post ready to edit')
    } catch (err) {
      setFailedStage(current)
      toast.error(err.message)
    } finally {
      setStage(null)
      lock.current = false
    }
  }
  // Retrying after content succeeded keeps the copy; the plan is rebuilt without a model call.
  const retry = () => generate({ keepCopy: failedStage && failedStage !== 'content' ? copy : null })

  const progress = [
    { key: 'content', label: 'Preparing content and design plan' },
    ...(needsVisuals === false ? [] : [{ key: 'visuals', label: 'Preparing visuals' }]),
    { key: 'build', label: 'Building and checking your post' },
  ].map(item => {
    const done = item.key === 'content' ? !!plan : item.key === 'visuals' ? !!resolved : !!canvas
    const state = stage === item.key ? 'active' : failedStage === item.key ? 'error' : done ? 'done' : 'pending'
    return { ...item, state }
  })
  const started = running || copy || plan || canvas || failedStage

  const isCarousel = idea.format === 'carousel'
  const canvasId   = canvas?.id
  const validation = canvas?.validation

  return (
    <div className="rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">

      {/* ── Header ── */}
      <div className="px-5 py-4 flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10 flex-shrink-0 mt-0.5">
          <Lightbulb className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-1">
            <Badge className={`text-xs font-medium ${getPillarColor(idea.pillar)}`}>{idea.pillar}</Badge>
            <Badge variant="outline" className="text-xs gap-1">
              {isCarousel ? <><LayoutTemplate className="w-3 h-3" /> Carousel</> : <><ImageIcon className="w-3 h-3" /> Single</>}
            </Badge>
          </div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">{idea.topic}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">"{idea.hook}"</p>
        </div>
      </div>

      {/* ── Progress: only real stages; visuals is omitted when the design uses no imagery ── */}
      {started && (
        <ol className="px-5 pb-3 space-y-1.5" aria-live="polite">
          {progress.map(item => (
            <li key={item.key} className={`flex items-center gap-2 text-xs ${item.state === 'pending' ? 'text-slate-400' : item.state === 'error' ? 'text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-slate-300'}`}>
              {item.state === 'active' ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                : item.state === 'done' ? <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                : item.state === 'error' ? <AlertCircle className="w-3.5 h-3.5" />
                : <span className="w-3.5 h-3.5 rounded-full border border-slate-300 dark:border-slate-600" />}
              {item.label}
            </li>
          ))}
          {needsVisuals === false && <li className="text-[11px] text-slate-400 pl-5">This design uses typography and graphics only — no images needed.</li>}
        </ol>
      )}

      {/* ── Actions ── */}
      <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
        {!canvas && !failedStage && (
          <Button size="sm" onClick={() => generate()} disabled={running} className="gap-1.5">
            {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {running ? 'Creating your post…' : 'Generate post'}
          </Button>
        )}
        {failedStage && !running && (
          <Button size="sm" onClick={retry} className="gap-1.5"><RefreshCw className="w-3.5 h-3.5" />Retry</Button>
        )}
        {canvas && !running && (
          <>
            <Button size="sm" variant="outline" onClick={() => generate({ keepCopy: copy })} className="gap-1.5" title="Rebuild the design with the same copy. No new AI writing.">
              <RefreshCw className="w-3.5 h-3.5" />Rebuild design · keep copy
            </Button>
            <Button size="sm" variant="ghost" onClick={() => generate()} className="gap-1.5">
              <Sparkles className="w-3.5 h-3.5" />New version
            </Button>
          </>
        )}
        {(copy || resolved || canvas || error) && (
          <button onClick={() => setShowDetails(v => !v)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1">
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}Details
          </button>
        )}
        {canvasId && (
          <a href={isCarousel ? `/carousel/${canvasId}` : `/editor/${canvasId}`} target="_blank" rel="noopener noreferrer" className="ml-auto">
            <Button size="sm" className="gap-1.5"><ExternalLink className="w-3.5 h-3.5" />Open in editor</Button>
          </a>
        )}
      </div>

      {error && !running && <div className="px-5 pb-4"><ErrorBlock label="Post could not be created" message={error} /></div>}

      {/* ── Details ── */}
      {showDetails && (
        <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-5">
          {copy && (
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Content</p>
              {!isCarousel && (
                <div className="space-y-2">
                  {copy.headline && <p className="text-base font-bold text-slate-900 dark:text-slate-100">{copy.headline}</p>}
                  {copy.subheadline && <p className="text-sm text-slate-600 dark:text-slate-400">{copy.subheadline}</p>}
                  {copy.supportingText && <p className="text-sm text-slate-600 dark:text-slate-400">{copy.supportingText}</p>}
                  {copy.cta && <p className="text-sm font-semibold text-primary">→ {copy.cta}</p>}
                </div>
              )}
              {isCarousel && Array.isArray(copy.slides) && copy.slides.length > 0 && (
                <div className="space-y-1.5">{copy.slides.map((slide, i) => <SlideRow key={slide.slideNumber ?? i} slide={slide} />)}</div>
              )}
              {copy.caption && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5"><MessageSquare className="w-3 h-3" />Caption</p>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{copy.caption}</p>
                </div>
              )}
              {Array.isArray(copy.hashtags) && copy.hashtags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {copy.hashtags.map((tag, i) => <span key={i} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-mono">{tag.startsWith('#') ? tag : `#${tag}`}</span>)}
                </div>
              )}
            </section>
          )}
          {resolved && resolved.slots.some(s => s.needs_visual) && (
            <section className="space-y-3">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Visuals</p>
              {resolved.slots.filter(s => s.needs_visual).map(slot => {
                const asset = slot.resolvedAsset
                return (
                  <div key={slot.slot_id} className="flex items-start gap-3">
                    <ResolvedImagePreview asset={asset} label={slot.slot_label} />
                    <div className="flex-1 min-w-0 space-y-1">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{slot.slot_label}</span>
                      {slot.visual_purpose && <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-3">{slot.visual_purpose}</p>}
                      {asset?.photo_page && /^https:\/\//.test(asset.photo_page) && (
                        <a href={asset.photo_page} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-500 underline">Photo{asset.photographer ? ` by ${asset.photographer}` : ''} on {asset.source === 'pexels' ? 'Pexels' : 'Unsplash'}</a>
                      )}
                      {slot.warning && <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400"><AlertCircle className="w-3 h-3 flex-shrink-0" />{slot.warning}</div>}
                    </div>
                  </div>
                )
              })}
            </section>
          )}
          {canvas && (
            <section className="space-y-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Final checks</p>
              <p className="text-xs text-slate-600 dark:text-slate-400">{canvas.width}×{canvas.height} · {isCarousel ? `${canvas.pages?.length || 0} slides` : '1 slide'} · {(isCarousel ? (canvas.pages || []).reduce((n, p) => n + (p.nodes || []).length, 0) : (canvas.nodes || []).length)} editable elements</p>
              {validation?.corrections?.length > 0 && <ul className="text-xs text-slate-500 list-disc pl-4">{[...new Set(validation.corrections)].map(c => <li key={c}>Fixed: {c}</li>)}</ul>}
              {validation?.warnings?.length > 0 && <ul className="text-xs text-amber-600 dark:text-amber-400 list-disc pl-4">{[...new Set(validation.warnings)].map(w => <li key={w}>{w}</li>)}</ul>}
            </section>
          )}
        </div>
      )}
    </div>
  )
}


function ErrorBlock({ label, message }) {
  return (
    <div className="flex items-start gap-2 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
      <AlertCircle className="w-3.5 h-3.5 text-red-500 flex-shrink-0 mt-0.5" />
      <div>
        <p className="text-xs font-semibold text-red-700 dark:text-red-400">{label}</p>
        <p className="text-xs text-red-600 dark:text-red-400">{message}</p>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Creation({ flowId, brandContext: suppliedBrandContext }) {
  const [savedBrandContext,setSavedBrandContext]=useState(null)
  const brandContext = { ...(savedBrandContext||suppliedBrandContext), id: flowId || suppliedBrandContext?.id }
  const [ideas, setIdeas]             = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [copyResults, setCopyResults]       = useState({})
  const [planResults, setPlanResults]       = useState({})
  const [resolveResults, setResolveResults] = useState({})
  const [designResults, setDesignResults]   = useState({})
  const [loadingIdeas, setLoadingIdeas] = useState(false)
  const [initialising, setInitialising] = useState(true)
  const [selectionMode, setSelectionMode] = useState(false)

  const hasBrand    = !!(brandContext?.name || brandContext?.about)
  const globalDesignCount = (brandContext?.designs || []).filter(design => design.source === 'global').length
  const selectedIdeas = ideas.filter(i => selectedIds.has(i.id))
  const brandId     = flowId ? `brand_${flowId}` : null

  // ── Persist ───────────────────────────────────────────────────────────────

  const persistToFlow = useCallback(async (newIdeas, newCopy, newPlan, newResolve, newDesign) => {
    if (!flowId) return
    try {
      await fetch(`/api/flows/${flowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          creationState: {
            ideas: newIdeas,
            copyResults: newCopy,
            planResults: newPlan,
            resolveResults: newResolve,
            designResults: newDesign,
          }
        }),
      })
    } catch (e) {
      console.warn('Failed to persist creation state', e)
    }
  }, [flowId])

  // ── Load on mount ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!flowId) { setInitialising(false); return }
    fetch(`/api/flows/${flowId}`)
      .then(r => r.json())
      .then(flow => {
        if(flow?.brandContext)setSavedBrandContext(flow.brandContext)
        const saved = flow?.creationState
        if (saved?.ideas?.length) {
          setIdeas(saved.ideas)
          setCopyResults(saved.copyResults    || {})
          setPlanResults(saved.planResults    || {})
          setResolveResults(saved.resolveResults || {})
          setDesignResults(saved.designResults  || {})
        }
      })
      .catch(() => {})
      .finally(() => setInitialising(false))
  }, [flowId])

  // ── Step 1: generate ideas ────────────────────────────────────────────────

  const generateIdeas = async () => {
    if(loadingIdeas)return
    if (!hasBrand) { toast.error('Save brand information first'); return }
    setLoadingIdeas(true)
    try {
      const res  = await fetch('/api/generate-content-ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandContext,existingTopics:ideas.slice(0,30).map(i=>i.topic),existingIdeas:ideas.slice(0,30).map(i=>({topic:i.topic,pillar:i.pillar,format:i.format,angle:i.angle})) }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      if (!Array.isArray(data.ideas) || !data.ideas.length) throw new Error('No ideas returned')
      const next=[data.ideas[0],...ideas]
      setIdeas(next)
      await persistToFlow(next, copyResults, planResults, resolveResults, designResults)
      toast.success('New idea added')
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoadingIdeas(false)
    }
  }

  const clearIdeas = async () => {
    setIdeas([])
    setSelectedIds(new Set())
    setCopyResults({})
    setPlanResults({})
    setResolveResults({})
    setDesignResults({})
    await persistToFlow([], {}, {}, {}, {})
    toast.success('Ideas cleared')
  }

  const toggleIdea = id => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const toggleAll = () =>
    setSelectedIds(selectedIds.size === ideas.length ? new Set() : new Set(ideas.map(i => i.id)))

  // ── Per-post result setters ───────────────────────────────────────────────

  const setCopyForIdea = useCallback((ideaId, val) => {
    setCopyResults(prev => {
      const next = { ...prev, [ideaId]: val }
      persistToFlow(ideas, next, planResults, resolveResults, designResults)
      return next
    })
  }, [ideas, planResults, resolveResults, designResults, persistToFlow])

  const setPlanForIdea = useCallback((ideaId, val) => {
    setPlanResults(prev => {
      const next = { ...prev, [ideaId]: val }
      persistToFlow(ideas, copyResults, next, resolveResults, designResults)
      return next
    })
  }, [ideas, copyResults, resolveResults, designResults, persistToFlow])

  const setResolveForIdea = useCallback((ideaId, val) => {
    setResolveResults(prev => {
      const next = { ...prev, [ideaId]: val }
      persistToFlow(ideas, copyResults, planResults, next, designResults)
      return next
    })
  }, [ideas, copyResults, planResults, designResults, persistToFlow])

  const setDesignForIdea = useCallback((ideaId, val) => {
    setDesignResults(prev => {
      const next = { ...prev, [ideaId]: val }
      persistToFlow(ideas, copyResults, planResults, resolveResults, next)
      return next
    })
  }, [ideas, copyResults, planResults, resolveResults, persistToFlow])

  // ── Delete selected ideas ────────────────────────────────────────────────

  const deleteSelected = async () => {
    const remaining = ideas.filter(i => !selectedIds.has(i.id))
    const nextCopy    = Object.fromEntries(Object.entries(copyResults).filter(([k]) => !selectedIds.has(k)))
    const nextPlan    = Object.fromEntries(Object.entries(planResults).filter(([k]) => !selectedIds.has(k)))
    const nextResolve = Object.fromEntries(Object.entries(resolveResults).filter(([k]) => !selectedIds.has(k)))
    const nextDesign  = Object.fromEntries(Object.entries(designResults).filter(([k]) => !selectedIds.has(k)))
    setIdeas(remaining)
    setCopyResults(nextCopy)
    setPlanResults(nextPlan)
    setResolveResults(nextResolve)
    setDesignResults(nextDesign)
    setSelectedIds(new Set())
    setSelectionMode(false)
    await persistToFlow(remaining, nextCopy, nextPlan, nextResolve, nextDesign)
    toast.success(`${selectedIds.size} post${selectedIds.size > 1 ? 's' : ''} deleted`)
  }

  // ── Determine next action label for selection ─────────────────────────────

  const nextActionForSelection = (() => {
    if (!selectedIdeas.length) return null
    const allHaveCanvas = selectedIdeas.every(i => designResults[i.id]?.canvas && !designResults[i.id]?.error)
    return allHaveCanvas ? { label: 'Regenerate posts', Icon: RefreshCw } : { label: 'Generate posts', Icon: Sparkles }
  })()

  const runAllSelected = async () => {
    if (!selectedIdeas.length) { toast.error('Select at least one idea'); return }
    toast.info(`Creating ${selectedIdeas.length} post${selectedIdeas.length > 1 ? 's' : ''}…`)
    // Posts run one at a time so a batch never multiplies concurrent AI requests.
    for (const idea of selectedIdeas) {
      const reset = { loading: false, error: null }
      setCopyResults(prev => ({ ...prev, [idea.id]: { ...reset, copy: null } }))
      setPlanResults(prev => ({ ...prev, [idea.id]: { ...reset, plan: null } }))
      setResolveResults(prev => ({ ...prev, [idea.id]: { ...reset, resolved: null } }))
      setDesignResults(prev => ({ ...prev, [idea.id]: { ...reset, canvas: null } }))
      try {
        await runPostGeneration({
          idea, brandContext, brandId, keepCopy: null, onStage: () => {},
          onCopy: v => setCopyResults(prev => ({ ...prev, [idea.id]: v })),
          onPlan: v => setPlanResults(prev => ({ ...prev, [idea.id]: v })),
          onResolve: v => setResolveResults(prev => ({ ...prev, [idea.id]: v })),
          onDesign: v => setDesignResults(prev => ({ ...prev, [idea.id]: v })),
        })
      } catch (err) { console.warn('Post generation failed', idea.id, err.message) }
    }

    // Final persist
    setCopyResults(prev => { persistToFlow(ideas, prev, planResults, resolveResults, designResults); return prev })
    toast.success('Pipeline complete')
  }

  // ─────────────────────────────────────────────────────────────────────────

  if (initialising) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {globalDesignCount === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-200">
          <span>Using your saved starter designs. To use the Global Design Library, select a design for this brand.</span>
          <a href={`/flow/${flowId}/brand-information`} className="font-semibold underline underline-offset-4">Choose designs</a>
        </div>
      )}

      {/* ── Generate ideas card ── */}
      <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-base">Content Ideas</CardTitle>
              <CardDescription className="text-xs">Create one new Instagram brief per click</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {!hasBrand && (
            <div className="flex items-start gap-2 mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <BookOpen className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700 dark:text-amber-300">
                No brand found. Fill in the <strong>Brand Personalization</strong> tab first.
              </p>
            </div>
          )}
          <div className="flex gap-2">
            <Button onClick={generateIdeas} disabled={loadingIdeas || !hasBrand} size="lg" className="flex-1">
              {loadingIdeas
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Generating…</>
                : ideas.length > 0
                  ? <><Sparkles className="w-4 h-4 mr-2" />Generate another idea</>
                  : <><Sparkles className="w-4 h-4 mr-2" />Generate idea</>
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

      {/* ── Ideas list ── */}
      {ideas.length > 0 && (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="font-semibold text-sm text-slate-900 dark:text-slate-100">{ideas.length} ideas</span>
              {selectionMode && selectedIds.size > 0 && <Badge variant="secondary">{selectedIds.size} selected</Badge>}
            </div>
            <div className="flex items-center gap-2">
              {selectionMode && (
                <button onClick={toggleAll} className="text-sm text-primary hover:underline font-medium">
                  {selectedIds.size === ideas.length ? 'Deselect all' : 'Select all'}
                </button>
              )}
              <Button
                size="sm"
                variant={selectionMode ? 'secondary' : 'outline'}
                className="h-7 text-xs"
                onClick={() => {
                  setSelectionMode(v => !v)
                  setSelectedIds(new Set())
                }}
              >
                {selectionMode ? 'Cancel' : 'Select'}
              </Button>
            </div>
          </div>

          {/* Cards */}
          <div className="space-y-3">
            {ideas.map(idea => (
              <div key={idea.id} className="flex gap-3 items-start">
                {/* Checkbox — only visible in selection mode */}
                {selectionMode && (
                  <button
                    onClick={() => toggleIdea(idea.id)}
                    className={`mt-4 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors
                      ${selectedIds.has(idea.id) ? 'border-primary bg-primary text-primary-foreground' : 'border-slate-300 dark:border-slate-600 hover:border-primary'}`}
                    aria-label={selectedIds.has(idea.id) ? 'Deselect' : 'Select'}
                  >
                    {selectedIds.has(idea.id) && <Check className="w-3 h-3" />}
                  </button>
                )}

                {/* Pipeline card */}
                <div className="flex-1 min-w-0">
                  <PostPipelineCard
                    idea={idea}
                    brandContext={brandContext}
                    brandId={brandId}
                    copyState={copyResults[idea.id]}
                    planState={planResults[idea.id]}
                    resolveState={resolveResults[idea.id]}
                    designState={designResults[idea.id]}
                    onCopyDone={setCopyForIdea}
                    onPlanDone={setPlanForIdea}
                    onResolveDone={setResolveForIdea}
                    onDesignDone={setDesignForIdea}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Batch CTA */}
          {selectionMode && selectedIds.size > 0 && (
            <div className="sticky bottom-6 z-10">
              <div className="rounded-xl border-2 border-primary bg-white dark:bg-slate-950 shadow-lg p-4 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm">
                    {selectedIds.size} post{selectedIds.size > 1 ? 's' : ''} selected
                  </p>
                  {nextActionForSelection && (
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Next: {nextActionForSelection.label}
                    </p>
                  )}
                </div>
                {/* Delete */}
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:border-destructive flex-shrink-0"
                  onClick={deleteSelected}
                >
                  <Trash2 className="w-3.5 h-3.5" />Delete
                </Button>
                {/* Next action */}
                {nextActionForSelection && (
                  <Button size="sm" onClick={runAllSelected} className="gap-1.5 flex-shrink-0">
                    <nextActionForSelection.Icon className="w-3.5 h-3.5" />
                    {nextActionForSelection.label}
                  </Button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
