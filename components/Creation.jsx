'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import ResolvedImagePreview from '@/components/ResolvedImagePreview'
import ImageDispositionPicker from '@/components/ImageDispositionPicker'
import {
  Loader2, Sparkles, Lightbulb, Check, RefreshCw,
  LayoutTemplate, Image as ImageIcon, ChevronDown, ChevronUp,
  Users, Target, Eye, BookOpen, PenLine,
  Hash, FileText, MessageSquare, AlertCircle, Layers, Trash2,
  Boxes, Upload, Wand2, Ban, Tag, Search, ExternalLink,
  ArrowRight, CheckCircle2
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

// ─── Per-post pipeline card ───────────────────────────────────────────────────

const STEP_KEYS = ['copy', 'layout', 'plan', 'resolve', 'design']

function PostPipelineCard({
  idea, brandContext, brandId,
  copyState, planState, resolveState, designState,
  onCopyDone, onPlanDone, onResolveDone, onDesignDone,
}) {
  // Which step's content is currently visible
  const [activeView, setActiveView] = useState(null)
  const [stepByStep,setStepByStep]=useState(false)
  const [imageDisposition,setImageDisposition]=useState(null)
  const [autoRunning, setAutoRunning] = useState(false)
  const autoLock = useRef(false)
  // Which step is showing a regenerate confirmation popover
  const [confirmRegen, setConfirmRegen] = useState(null)

  const [copyLoading,    setCopyLoading]    = useState(false)
  const [planLoading,    setPlanLoading]    = useState(false)
  const [resolveLoading, setResolveLoading] = useState(false)
  const [designLoading,  setDesignLoading]  = useState(false)
  const [layoutLoading,setLayoutLoading]=useState(false)
  const layoutPlan=planState?.layoutPlan||planState?.plan?.layoutPlan

  const copy     = copyState?.copy        ?? null
  const plan     = planState?.plan        ?? null
  const resolved = resolveState?.resolved ?? null
  const canvas   = designState?.canvas    ?? null

  const copyError    = copyState?.error    ?? null
  const planError    = planState?.error    ?? null
  const resolveError = resolveState?.error ?? null
  const designError  = designState?.error  ?? null

  const anyLoading = autoRunning || copyLoading || layoutLoading || planLoading || resolveLoading || designLoading

  // ── cascade clear downstream steps ───────────────────────────────────────
  // When step N is rerun, steps N+1…4 are invalidated.

  const clearFrom = (stepKey) => {
    const idx = ['copy','plan','resolve','design'].indexOf(stepKey==='layout'?'plan':stepKey)
    if (idx <= 0) {
      onCopyDone(idea.id,    { loading: false, error: null, copy: null })
    }
    if (idx <= 1) {
      onPlanDone(idea.id,    { loading: false, error: null, plan: null })
    }
    if (idx <= 2) {
      onResolveDone(idea.id, { loading: false, error: null, resolved: null })
    }
    if (idx <= 3) {
      onDesignDone(idea.id,  { loading: false, error: null, canvas: null })
    }
  }

  // ── step runners ──────────────────────────────────────────────────────────

  const runCopy = async () => {
    clearFrom('copy')
    setCopyLoading(true)
    try {
      for (let attempt = 0; attempt < 1; attempt++) {
        try {
          const res = await fetch('/api/generate-copywriting', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ brandContext, idea }),
          })
          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Failed')
          onCopyDone(idea.id, { loading: false, error: null, copy: data })
          setActiveView('copy')
          return data
        } catch (err) {
          const is429 = err?.message?.includes('429') || err?.message?.includes('rate_limit')

          throw err
        }
      }
    } catch (err) {
      onCopyDone(idea.id, { loading: false, error: err.message, copy: null })
      toast.error(`Copy failed: ${err.message}`)
    } finally {
      setCopyLoading(false)
    }
  }

  const runLayout=async(currentCopy=copy,{keepResults=false}={})=>{
    if(!currentCopy)return
    if(!keepResults)clearFrom('layout')
    setLayoutLoading(true);setActiveView('layout')
    try {
      const response=await fetch('/api/plan-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase:'canvas',brandContext,copy:currentCopy,idea,brand_id:brandId,imageDisposition:imageDisposition||(keepResults?layoutPlan?.imageDisposition:undefined),designId:keepResults?(layoutPlan?.designId||canvas?.designSelection?.id||resolved?.designId):undefined})})
      const result=await response.json();if(!response.ok)throw Error(result.error||'Layout failed')
      onPlanDone(idea.id,{loading:false,error:null,plan:keepResults&&plan?{...plan,layoutPlan:result,designId:result.designId}:null,layoutPlan:result})
      if(keepResults&&resolved){
        const updatedResolved={...resolved,layoutPlan:result,designId:result.designId}
        onResolveDone(idea.id,{...resolveState,resolved:updatedResolved})
        if(canvas){
          const updatedCanvas=await runDesign(updatedResolved,currentCopy,{keepResults:true})
          if(updatedCanvas)toast.success('Design updated using your existing copy and images.')
        }else toast.success('Design regenerated. Existing assets and resolved images kept.')
      }else if(keepResults)toast.success('Design regenerated. Other steps kept.')
      return result
    }catch(e){
      if(keepResults)toast.error(`Design regeneration failed: ${e.message}`)
      else onPlanDone(idea.id,{loading:false,error:e.message,plan:null})
    }finally{setLayoutLoading(false)}
  }
  const runPlan = async (currentCopy = copy) => {
    if (!currentCopy) { toast.error('Write copy first'); return }
    const currentLayout=layoutPlan||await runLayout(currentCopy)
    if(!currentLayout)return
    clearFrom('plan')
    setPlanLoading(true)
    try {
      const res = await fetch('/api/plan-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandContext, copy: currentCopy, idea, brand_id: brandId,layoutPlan:currentLayout }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onPlanDone(idea.id, { loading: false, error: null, plan: data,layoutPlan:currentLayout })
      setActiveView('plan')
      return data
    } catch (err) {
      onPlanDone(idea.id, { loading: false, error: err.message, plan: null })
      toast.error(`Asset plan failed: ${err.message}`)
    } finally {
      setPlanLoading(false)
    }
  }

  const runResolve = async (currentPlan = plan) => {
    if (!currentPlan) { toast.error('Plan assets first'); return }
    clearFrom('resolve')
    setResolveLoading(true)
    try {
      const res = await fetch('/api/resolve-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: currentPlan, brand_id: brandId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onResolveDone(idea.id, { loading: false, error: null, resolved: data })
      setActiveView('resolve')
      return data
    } catch (err) {
      onResolveDone(idea.id, { loading: false, error: err.message, resolved: null })
      toast.error(`Asset resolve failed: ${err.message}`)
    } finally {
      setResolveLoading(false)
    }
  }

  const runDesign = async (currentResolved = resolved, currentCopy = copy,{keepResults=false}={}) => {
    if (!currentResolved) { toast.error('Resolve assets first'); return }
    if(!keepResults)clearFrom('design')
    setDesignLoading(true)
    try {
      const res = await fetch('/api/design-canvas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext, copy: currentCopy, resolvedPlan: currentResolved,
          canvasName: `${brandContext?.name ?? ''} — ${idea.topic}`.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed')
      onDesignDone(idea.id, { loading: false, error: null, canvas: data })
      setActiveView('design')
      return data
    } catch (err) {
      onDesignDone(idea.id, { loading: false, error: err.message, canvas:keepResults?canvas:null })
      toast.error(`Canvas design failed: ${err.message}`)
    } finally {
      setDesignLoading(false)
    }
  }

  const generatePost = async () => {
    if (autoLock.current || anyLoading) return
    autoLock.current = true
    setAutoRunning(true)
    setConfirmRegen(null)
    try {
      let currentCopy = copyError ? null : copy
      let currentPlan = currentCopy && !planError ? plan : null
      let currentResolved = currentPlan && !resolveError ? resolved : null
      if (!currentCopy) { setActiveView('copy'); currentCopy = await runCopy(); if (!currentCopy) return }
      if (!currentPlan) { setActiveView('plan'); currentPlan = await runPlan(currentCopy); if (!currentPlan) return }
      if (!currentResolved) { setActiveView('resolve'); currentResolved = await runResolve(currentPlan); if (!currentResolved) return }
      setActiveView('design')
      const result = await runDesign(currentResolved, currentCopy)
      if (result) toast.success('Post ready to edit')
    } finally {
      autoLock.current = false
      setAutoRunning(false)
    }
  }

  // ── next step ─────────────────────────────────────────────────────────────

  const nextStep = (() => {
    if (!copy    || copyError)     return { key: 'copy',    label: 'Write copy',     Icon: PenLine,   run: runCopy,    loading: copyLoading    }
    if (!layoutPlan) return {key:'layout',label:'Plan canvas',Icon:Sparkles,run:runLayout,loading:layoutLoading}
    if (!plan    || planError)     return { key: 'plan',    label: 'Plan assets',    Icon: Boxes,     run: runPlan,    loading: planLoading    }
    if (!resolved || resolveError) return { key: 'resolve', label: 'Resolve assets', Icon: ImageIcon, run: runResolve, loading: resolveLoading }
    if (!canvas  || designError)   return { key: 'design',  label: 'Fit final canvas',  Icon: Sparkles,  run: runDesign,  loading: designLoading  }
    return null
  })()

  const isCarousel = idea.format === 'carousel'
  const canvasId   = canvas?.id

  // Steps meta for the progress strip
  const steps = [
    { key: 'copy',    label: 'Copy',    Icon: PenLine,   done: !!copy,     error: !!copyError,    loading: copyLoading,    canRun: true,       run: runCopy    },
    { key:'layout',label:'Canvas',Icon:Sparkles,done:!!layoutPlan,error:!!planError&&!layoutPlan,loading:layoutLoading,canRun:!!copy,run:runLayout },
    { key: 'plan',    label: 'Assets',  Icon: Boxes,     done: !!plan,     error: !!planError,    loading: planLoading,    canRun: !!layoutPlan,     run: runPlan    },
    { key: 'resolve', label: 'Resolve', Icon: ImageIcon, done: !!resolved, error: !!resolveError, loading: resolveLoading, canRun: !!plan,     run: runResolve },
    { key: 'design',  label: 'Fit',  Icon: Sparkles,  done: !!canvas,   error: !!designError,  loading: designLoading,  canRun: !!resolved, run: runDesign  },
  ]

  // Downstream warning: how many steps will be cleared if we regenerate
  const downstreamCount = (stepKey) => {
    const idx = STEP_KEYS.indexOf(stepKey)
    return STEP_KEYS.slice(idx + 1).filter(k => {
      if (k === 'layout') return !!layoutPlan
      if (k === 'plan')    return !!plan
      if (k === 'resolve') return !!resolved
      if (k === 'design')  return !!canvas
      return false
    }).length
  }

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

      {/* ── Pipeline progress strip ── */}
      <div className="px-5 pb-3 flex items-center gap-1.5 flex-wrap">
        {steps.map((s, idx) => {
          const isActive = activeView === s.key
          return (
            <div key={s.key} className="flex items-center gap-1.5">
              {/* Step pill — clicking opens the step's content panel */}
              <button
                onClick={() => {
                  if (s.done || s.error) setActiveView(activeView === s.key ? null : s.key)
                }}
                disabled={!s.done && !s.error}
                className={`
                  flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-semibold transition-all
                  ${s.loading
                    ? 'bg-primary/10 text-primary cursor-wait'
                    : s.done
                      ? isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300 hover:bg-green-200 cursor-pointer'
                      : s.error
                        ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 cursor-pointer'
                        : s.canRun
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-600'
                  }
                `}
              >
                {s.loading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : s.done
                    ? <CheckCircle2 className="w-3 h-3" />
                    : s.error
                      ? <AlertCircle className="w-3 h-3" />
                      : <s.Icon className="w-3 h-3" />
                }
                {s.label}
              </button>
              {idx < steps.length - 1 && (
                <ArrowRight className="w-3 h-3 flex-shrink-0 text-slate-200 dark:text-slate-700" />
              )}
            </div>
          )
        })}
      </div>

      {/* ── Primary action row ── */}
      <div className="px-5 pb-3"><label className="text-sm flex items-center gap-2"><input type="checkbox" checked={stepByStep} disabled={anyLoading} onChange={e=>setStepByStep(e.target.checked)}/>Step-by-step mode</label></div>
      {stepByStep&&copy&&(!plan||nextStep?.key==='design'||activeView==='layout'||activeView==='design')&&<div className="px-5 pb-4 space-y-2"><p className="text-sm font-semibold">Image style for this post</p><p className="text-xs text-muted-foreground">Uses your brand default unless changed here. Changing style resets the asset and final design steps; click each next-step button to continue.</p><ImageDispositionPicker value={imageDisposition||layoutPlan?.imageDisposition||brandContext?.imageDisposition||'cutout'} disabled={anyLoading} onChange={value=>{setImageDisposition(value);clearFrom('layout');setActiveView('layout')}}/></div>}
      <div className="px-5 pb-4 flex items-center gap-2 flex-wrap">
        {!stepByStep&&(nextStep || autoRunning) && <Button size="sm" onClick={generatePost} disabled={anyLoading} className="gap-1.5">
          {autoRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {autoRunning ? 'Generating post…' : copy ? 'Continue generating post' : 'Generate post'}
        </Button>}
        <span role="status" aria-live="polite" className="text-xs text-slate-500">
          {autoRunning ? copyLoading ? 'Step 1 of 5 · Writing copy' : layoutLoading ? 'Step 2 of 5 · Planning canvas' : planLoading ? 'Step 3 of 5 · Planning assets' : resolveLoading ? 'Step 4 of 5 · Creating images' : designLoading ? 'Step 5 of 5 · Fitting final canvas' : 'Preparing next step…' : ''}
        </span>
        {/* Next step button */}
        {nextStep && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {setStepByStep(true);nextStep.run()}}
            disabled={nextStep.loading || anyLoading}
            className="gap-1.5"
          >
            {nextStep.loading
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Running…</>
              : <><nextStep.Icon className="w-3.5 h-3.5" />{nextStep.label}</>
            }
          </Button>
        )}

        {/* All done indicator */}
        {!nextStep && !anyLoading && (
          <span className="flex items-center gap-1.5 text-xs font-medium text-green-600 dark:text-green-400">
            <CheckCircle2 className="w-3.5 h-3.5" />All steps complete
          </span>
        )}

        {/* Open in editor */}
        {canvasId && (
          <a
            href={isCarousel ? `/carousel/${canvasId}` : `/editor/${canvasId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto"
          >
            <Button size="sm" variant="outline" className="gap-1.5">
              <ExternalLink className="w-3.5 h-3.5" />Open in editor
            </Button>
          </a>
        )}
      </div>

      {/* ── Step content panels ── */}
      {activeView && (
        <div className="border-t border-slate-100 dark:border-slate-800">

          {/* Panel header with regenerate button */}
          <div className="px-5 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-900/60">
            <div className="flex items-center gap-2">
              {steps.filter(s => s.done || s.error).map(s => (
                <button
                  key={s.key}
                  onClick={() => setActiveView(s.key)}
                  className={`text-xs font-semibold px-2.5 py-1 rounded-md transition-colors
                    ${activeView === s.key
                      ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                    }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap justify-end">
            {activeView === 'layout' && layoutPlan && (
              <button
                onClick={() => { setConfirmRegen(null); runLayout(copy,{keepResults:true}) }}
                disabled={anyLoading}
                title="Regenerate the design and update the finished post using the existing copy, assets, and resolved images."
                className="flex items-center gap-1.5 text-xs font-semibold text-primary px-2.5 py-1 rounded-md border border-primary/20 hover:bg-primary/5 transition-colors disabled:opacity-40"
              >
                <RefreshCw className={`w-3 h-3 ${layoutLoading ? 'animate-spin' : ''}`} />
                {layoutLoading ? 'Regenerating design…' : 'Regenerate design · keep other steps'}
              </button>
            )}
            {/* Regenerate — shows confirmation inline */}
            {confirmRegen === activeView ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">
                  {downstreamCount(activeView) > 0
                    ? `This will also clear ${downstreamCount(activeView)} downstream step${downstreamCount(activeView) > 1 ? 's' : ''}.`
                    : 'Regenerate this step?'}
                </span>
                <button
                  onClick={() => setConfirmRegen(null)}
                  className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setConfirmRegen(null)
                    const s = steps.find(s => s.key === activeView)
                    s?.run()
                  }}
                  disabled={anyLoading}
                  className="text-xs font-semibold text-white bg-primary hover:bg-primary/90 px-2.5 py-1 rounded transition-colors disabled:opacity-50"
                >
                  Regenerate
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmRegen(activeView)}
                disabled={anyLoading}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-40"
              >
                <RefreshCw className="w-3 h-3" />Regenerate
              </button>
            )}
            </div>
          </div>

          {/* Panel body */}
          <div className="px-5 py-4">

            {/* ── Copy view ── */}
            {activeView === 'copy' && (
              <div className="space-y-3">
                {copyError && <ErrorBlock label="Copywriting error" message={copyError} />}
                {copy && (
                  <>
                    {!isCarousel && (
                      <div className="space-y-2">
                        {copy.headline && <p className="text-base font-bold text-slate-900 dark:text-slate-100">{copy.headline}</p>}
                        {copy.subheadline && <p className="text-sm text-slate-600 dark:text-slate-400">{copy.subheadline}</p>}
                        {copy.supportingText && <p className="text-sm text-slate-600 dark:text-slate-400">{copy.supportingText}</p>}
                        {copy.cta && <p className="text-sm font-semibold text-primary">→ {copy.cta}</p>}
                      </div>
                    )}
                    {isCarousel && Array.isArray(copy.slides) && copy.slides.length > 0 && (
                      <div className="space-y-1.5">
                        {copy.slides.map(slide => <SlideRow key={slide.slideNumber} slide={slide} />)}
                      </div>
                    )}
                    {copy.caption && (
                      <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                          <MessageSquare className="w-3 h-3" />Caption
                        </p>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">{copy.caption}</p>
                      </div>
                    )}
                    {Array.isArray(copy.hashtags) && copy.hashtags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {copy.hashtags.map((tag, i) => (
                          <span key={i} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded font-mono">
                            {tag.startsWith('#') ? tag : `#${tag}`}
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Asset plan view ── */}
            {activeView==='layout'&&layoutPlan&&<div className="grid grid-cols-2 gap-4">{layoutPlan.slots.map((s,i)=><div key={s.slot_id} className="rounded-lg border p-3"><p className="text-sm font-medium mb-2">Slide {i+1} · {s.spec.composition||'Layout'}</p><svg viewBox="0 0 1080 1080" className="w-full bg-muted rounded"><rect width="1080" height="1080" fill="#f3f4f6"/>{s.spec.elements.filter(e=>e.role||e.type==='image').map((e,j)=><g key={j}><rect x={e.x} y={e.y} width={e.width} height={e.height} rx="12" fill={e.type==='image'?'#cbd5e1':'#334155'} opacity={e.role==='body'?.55:1}/><text x={e.x+16} y={e.y+36} fill={e.type==='image'?'#334155':'white'} fontSize="26">{e.role||'Image'}</text></g>)}</svg><p className="text-xs mt-2">{s.background?'Background photograph':s.needs_visual?'Subject image':'Typography'}</p></div>)}</div>}
            {activeView === 'plan' && (
              <div className="space-y-2">
                {planError && <ErrorBlock label="Asset plan error" message={planError} />}
                {plan && plan.slots.map(slot => {
                  const srcMeta = {
                    uploaded_asset: { label: 'Uploaded', cls: 'bg-green-100 text-green-700' },
                    unsplash:       { label: 'Stock photo', cls: 'bg-blue-100 text-blue-700' },
                    ai_generated:   { label: 'AI gen',    cls: 'bg-purple-100 text-purple-700' },
                    none:           { label: 'No image',  cls: 'bg-slate-100 text-slate-500' },
                  }[slot.preferred_source] ?? { label: slot.preferred_source, cls: 'bg-slate-100 text-slate-500' }
                  return (
                    <div key={slot.slot_id} className="flex items-start gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                      <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-[10px] mt-0.5">
                        {slot.slot_id.replace(/[^0-9]/g, '') || '·'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{slot.slot_label}</span>
                          <Badge className={`text-[10px] py-0 px-1.5 ${srcMeta.cls}`}>{srcMeta.label}</Badge>
                          {!slot.needs_visual && <Badge variant="outline" className="text-[10px] py-0 px-1.5">Type only</Badge>}
                        </div>
                        {slot.visual_purpose && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{slot.visual_purpose}</p>
                        )}
                        {slot.search_keywords?.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {slot.search_keywords.map(k => (
                              <span key={k} className="text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500 px-1.5 py-0.5 rounded font-mono">{k}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* ── Resolve view ── */}
            {activeView === 'resolve' && (
              <div className="space-y-3">
                {resolveError && <ErrorBlock label="Asset resolve error" message={resolveError} />}
                {resolved && (
                  <div className="space-y-3">
                    {resolved.slots.map(slot => {
                      const asset = slot.resolvedAsset
                      const srcCls = {
                        uploaded_asset: 'bg-green-100 text-green-700',
                        unsplash:       'bg-blue-100 text-blue-700',
                        pexels:         'bg-teal-100 text-teal-700',
                        ai_generated:   'bg-purple-100 text-purple-700',
                        none:           'bg-slate-100 text-slate-500',
                      }[slot.source] ?? 'bg-slate-100 text-slate-500'
                      return (
                        <div key={slot.slot_id} className="flex items-start gap-3">
                          <ResolvedImagePreview asset={asset} label={slot.slot_label} />
                          {/* Info */}
                          <div className="flex-1 min-w-0 space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{slot.slot_label}</span>
                              <Badge className={`text-[10px] py-0 px-1.5 ${srcCls}`}>{slot.source.replace('_', ' ')}</Badge>
                              {slot.resolvedAsset?.reused&&<Badge className="text-[10px] py-0 px-1.5">Reused from gallery · {Math.round((slot.resolvedAsset.match_score||0)*100)}% match</Badge>}
                              {asset?.width && asset?.height && (
                                <span className="text-[10px] text-slate-400 font-mono">{asset.width}×{asset.height}</span>
                              )}
                            </div>
                            {slot.visual_purpose && (
                              <p className="text-xs text-slate-500 dark:text-slate-400">{slot.visual_purpose}</p>
                            )}
                            {asset?.photo_page && /^https:\/\//.test(asset.photo_page) && (
                              <a href={asset.photo_page} target="_blank" rel="noopener noreferrer" className="block text-xs text-slate-500 underline">Photo{asset.photographer ? ` by ${asset.photographer}` : ''} on {asset.source === 'pexels' ? 'Pexels' : 'Unsplash'}</a>
                            )}
                            {slot.warning && (
                              <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                <AlertCircle className="w-3 h-3 flex-shrink-0" />{slot.warning}
                              </div>
                            )}

                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── Canvas view ── */}
            {activeView === 'design' && (
              <div className="space-y-3">
                {designError && <ErrorBlock label="Canvas design error" message={designError} />}
                {canvas && (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <p className="text-[10px] text-slate-500 mb-0.5">Type</p>
                        <p className="text-xs font-semibold capitalize">{canvas.type}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <p className="text-[10px] text-slate-500 mb-0.5">Size</p>
                        <p className="text-xs font-semibold">{canvas.width}×{canvas.height}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-2">
                        <p className="text-[10px] text-slate-500 mb-0.5">Slides</p>
                        <p className="text-xs font-semibold">{isCarousel ? canvas.pages?.length : 1}</p>
                      </div>
                    </div>
                    {isCarousel && canvas.pages?.length > 0 && (
                      <div className="space-y-1.5">
                        {canvas.pages.map((page, i) => {
                          const hasImage = (page.nodes || []).some(n => n.type === 'image')
                          const typeLabel = { top_peer: 'Cover', content: `Slide ${i}`, bottom_peer: 'CTA' }[page.type] ?? page.name
                          return (
                            <div key={page.id} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
                              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center flex-shrink-0 text-[10px]">{i + 1}</span>
                              <span className="font-medium">{typeLabel}</span>
                              <span className="text-slate-400">·</span>
                              <span>{(page.nodes || []).length} nodes</span>
                              {hasImage && <Badge variant="outline" className="text-[10px] py-0 px-1.5">image</Badge>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                      <p className="text-[10px] text-slate-500 flex-shrink-0">Canvas ID</p>
                      <p className="text-[10px] font-mono text-slate-600 dark:text-slate-400 truncate">{canvas.id}</p>
                    </div>
                  </>
                )}
              </div>
            )}

          </div>
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
        body: JSON.stringify({ brandContext,existingTopics:ideas.slice(0,30).map(i=>i.topic) }),
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
    // Find the earliest incomplete step across all selected
    const allHaveCopy    = selectedIdeas.every(i => copyResults[i.id]?.copy    && !copyResults[i.id]?.error)
    const allHavePlan    = selectedIdeas.every(i => planResults[i.id]?.plan    && !planResults[i.id]?.error)
    const allHaveResolve = selectedIdeas.every(i => resolveResults[i.id]?.resolved && !resolveResults[i.id]?.error)
    const allHaveCanvas  = selectedIdeas.every(i => designResults[i.id]?.canvas  && !designResults[i.id]?.error)
    if (!allHaveCopy)    return { label: 'Write copy',      Icon: PenLine   }
    if (!allHavePlan)    return { label: 'Plan assets',     Icon: Boxes     }
    if (!allHaveResolve) return { label: 'Resolve assets',  Icon: ImageIcon }
    if (!allHaveCanvas)  return { label: 'Fit final canvas',   Icon: Sparkles  }
    return { label: 'Re-run pipeline', Icon: RefreshCw }
  })()

  const runAllSelected = async () => {
    if (!selectedIdeas.length) { toast.error('Select at least one idea'); return }
    toast.info(`Starting pipeline for ${selectedIdeas.length} post${selectedIdeas.length > 1 ? 's' : ''}…`)
    for (const idea of selectedIdeas) {
      // Copy
      let copyData = null
      setCopyResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, copy: null } }))
      try {
        for (let attempt = 0; attempt < 1; attempt++) {
          try {
            const res = await fetch('/api/generate-copywriting', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ brandContext, idea }),
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || 'Failed')
            copyData = data
            setCopyResults(prev => ({ ...prev, [idea.id]: { loading: false, error: null, copy: data } }))
            break
          } catch (err) {

            throw err
          }
        }
      } catch (err) {
        setCopyResults(prev => ({ ...prev, [idea.id]: { loading: false, error: err.message, copy: null } }))
        continue
      }
      await sleep(1000)

      // Plan
      let planData = null
      setPlanResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, plan: null } }))
      try {
        const layoutResponse=await fetch('/api/plan-assets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase:'canvas',brandContext,copy:copyData,idea,brand_id:brandId})})
        const batchLayout=await layoutResponse.json()
        if(!layoutResponse.ok)throw Error(batchLayout.error||'Canvas planning failed')
        setPlanResults(prev=>({...prev,[idea.id]:{loading:true,error:null,plan:null,layoutPlan:batchLayout}}))
        const res = await fetch('/api/plan-assets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ brandContext, copy: copyData, idea, brand_id: brandId,layoutPlan:batchLayout }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        planData = data
        setPlanResults(prev => ({ ...prev, [idea.id]: { loading: false, error: null, plan: data } }))
      } catch (err) {
        setPlanResults(prev => ({ ...prev, [idea.id]: { loading: false, error: err.message, plan: null } }))
        continue
      }
      await sleep(500)

      // Resolve
      let resolvedData = null
      setResolveResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, resolved: null } }))
      try {
        const res = await fetch('/api/resolve-assets', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ plan: planData, brand_id: brandId }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        resolvedData = data
        setResolveResults(prev => ({ ...prev, [idea.id]: { loading: false, error: null, resolved: data } }))
      } catch (err) {
        setResolveResults(prev => ({ ...prev, [idea.id]: { loading: false, error: err.message, resolved: null } }))
        continue
      }

      // Design
      setDesignResults(prev => ({ ...prev, [idea.id]: { loading: true, error: null, canvas: null } }))
      try {
        const res = await fetch('/api/design-canvas', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            brandContext, copy: copyData, resolvedPlan: resolvedData,
            canvasName: `${brandContext?.name ?? ''} — ${idea.topic}`.trim(),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error || 'Failed')
        setDesignResults(prev => ({ ...prev, [idea.id]: { loading: false, error: null, canvas: data } }))
      } catch (err) {
        setDesignResults(prev => ({ ...prev, [idea.id]: { loading: false, error: err.message, canvas: null } }))
      }

      if (idea !== selectedIdeas[selectedIdeas.length - 1]) await sleep(1000)
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
