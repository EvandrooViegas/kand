'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ArrowLeft, Plus, Trash2, ArrowRight, Zap } from 'lucide-react'
import { toast } from 'sonner'
import { KandLogo } from '@/components/logo'
import { BEBAS } from './constants'
import {
  ThemeToggle,
  StepBar,
  StepBrand,
  StepConfigure,
  StepGenerate,
} from './components'

/**
 * Main Flow Page Client Component
 * Manages state for all steps and coordinates between sub-components
 */
export default function FlowPageClient({ initialFlows, initialCanvases, initialGalleries }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const flowIdParam = searchParams?.get('id') || null

  // ─── STATE MANAGEMENT ─────────────────────────────────────────────────────
  
  // Navigation & UI state
  const [step, setStep] = useState(1)
  const [maxStep, setMaxStep] = useState(1)

  // Data collections
  const [canvases, setCanvases] = useState(initialCanvases || [])
  const [galleries, setGalleries] = useState(initialGalleries || [])
  const [flows, setFlows] = useState(initialFlows || [])

  // Active flow context
  const [activeFlow, setActiveFlow] = useState(null)
  const [generating, setGenerating] = useState(false)

  // Form data state (Step 1: Brand)
  const [brand, setBrand] = useState({})
  const [extractedContext, setExtractedContext] = useState('')

  // Configuration state (Step 2: Configure)
  const [selectedCanvases, setSelectedCanvases] = useState([])
  const [galleryId, setGalleryId] = useState(null)
  const [tone, setTone] = useState('informative')
  const [language, setLanguage] = useState('english')
  const [carouselChance, setCarouselChance] = useState(30)

  // Flow list state
  const [newName, setNewName] = useState('')

  // ─── EFFECTS ──────────────────────────────────────────────────────────────

  // Load data on mount
  useEffect(() => {
    if (!flowIdParam && flows.length > 0) return
    fetch('/api/canvases')
      .then((r) => r.json())
      .then((d) => setCanvases(Array.isArray(d) ? d : []))
    fetch('/api/flows')
      .then((r) => r.json())
      .then((d) => setFlows(Array.isArray(d) ? d : []))
    loadGalleries()
  }, [])

  // Open flow when URL param changes
  useEffect(() => {
    if (flowIdParam && flows.length > 0 && !activeFlow) {
      const flowToOpen = flows.find((f) => f.id === flowIdParam)
      if (flowToOpen) {
        openFlow(flowToOpen)
      }
    }
  }, [flowIdParam, flows, activeFlow])

  // ─── DATA OPERATIONS ──────────────────────────────────────────────────────

  const loadGalleries = () =>
    fetch('/api/galleries')
      .then((r) => r.json())
      .then((d) => setGalleries(Array.isArray(d) ? d : []))

  const saveFlow = async (extra = {}) => {
    if (!activeFlow) return
    const body = {
      ...activeFlow,
      brandContext: brand,
      selectedCanvases,
      galleryId,
      tone,
      language,
      extractedContext,
      ...extra,
    }
    const res = await fetch(`/api/flows/${activeFlow.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const saved = await res.json()
    setActiveFlow(saved)
    setFlows((prev) => prev.map((f) => (f.id === saved.id ? saved : f)))
    return saved
  }

  const createFlow = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/flows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const flow = await res.json()
    setFlows((prev) => [flow, ...prev])
    setNewName('')
    openFlow(flow)
  }

  const openFlow = (flow) => {
    setActiveFlow(flow)
    setBrand(flow.brandContext || {})
    setSelectedCanvases(flow.selectedCanvases || [])
    setGalleryId(flow.galleryId || null)
    setTone(flow.tone || 'informative')
    setLanguage(flow.language || 'english')
    setExtractedContext(flow.extractedContext || '')

    // Determine max step based on flow progress
    let ms = 2 // Default: Brand + Configure
    if (flow.selectedCanvases?.length > 0) ms = 3 // + Generate
    setMaxStep(ms)

    // Determine current step: go to first incomplete step
    let currentStep = 1 // Default to Brand step (step 1)
    if (flow.brandContext && Object.keys(flow.brandContext).length > 0) currentStep = 2 // Brand done, go to Configure
    if (flow.selectedCanvases?.length > 0) currentStep = 3 // Configure done, go to Generate
    
    setStep(currentStep)
    router.push(`?id=${flow.id}`)
  }

  const deleteFlow = async (id) => {
    if (!confirm('Delete flow?')) return
    await fetch(`/api/flows/${id}`, { method: 'DELETE' })
    setFlows((prev) => prev.filter((f) => f.id !== id))
  }

  // ─── FLOW GENERATION ──────────────────────────────────────────────────────

  const generate = async () => {
    const saved = await saveFlow()
    if (!saved) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/flows/${saved.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carouselChance, language }),
      })
      const data = await res.json()
      if (data.posts && Array.isArray(data.posts)) {
        const refreshed = await fetch(`/api/flows/${saved.id}`).then((r) => r.json())
        setGenerating(false) // Set this first to hide GenerationProgress
        setActiveFlow(refreshed) // Then update flow to show posts
        // Stay on step 3 (Generate) to review posts, don't jump to step 4 (Schedule)
        if (step < 3) {
          setStep(3)
        }
        if (maxStep < 3) setMaxStep(3)
        toast.success(`${data.posts.length} posts generated`)
      } else if (data.error) {
        toast.error(data.error)
        setGenerating(false)
      } else {
        toast.error('Generation failed')
        setGenerating(false)
      }
    } catch (e) {
      console.error('Generation error:', e)
      toast.error('Generation failed')
      setGenerating(false)
    }
  }

  const updatePost = async (postId, patch) => {
    if (!activeFlow) return
    await fetch(`/api/flows/${activeFlow.id}/posts/${postId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then((r) => r.json())
    setActiveFlow(refreshed)
    if (patch.status === 'deleted') toast.success('Post deleted')
  }

  const rerenderPost = async (postId, newData) => {
    if (!activeFlow) return
    const res = await fetch(`/api/flows/${activeFlow.id}/rerender-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId, data: newData }),
    })
    const result = await res.json()
    if (result.success) {
      const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then((r) => r.json())
      setActiveFlow(refreshed)
      toast.success('Post updated')
    }
  }

  // ─── NAVIGATION ───────────────────────────────────────────────────────────

  const goTo = (n) => {
    if (n <= maxStep) setStep(n)
  }

  const advance = async () => {
    await saveFlow()
    const next = step + 1
    setStep(next)
    if (next > maxStep) setMaxStep(next)
  }

  const canAdvance = () => {
    if (step === 1) return true
    if (step === 2) return selectedCanvases.length > 0
    if (step === 3) return (activeFlow?.posts || []).some((p) => p.status === 'accepted')
    return false
  }

  // ─── RENDER: FLOW LIST VIEW ───────────────────────────────────────────────

  if (!flowIdParam) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground">
        <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <KandLogo size={28} />
            <span style={{ ...BEBAS, fontSize: 22 }}>FLOW</span>
            <span className="text-[10px] bg-[#D4FF00] text-foreground px-2 py-0.5 rounded-full font-bold border border-foreground/20">
              BETA
            </span>
          </div>
          <ThemeToggle />
        </header>
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          <div>
            <h1
              style={{
                ...BEBAS,
                fontSize: 'clamp(36px, 6vw, 72px)',
                lineHeight: 0.9,
              }}
            >
              AUTOMATE YOUR
              <br />
              <span style={{ color: '#9AB800' }}>INSTAGRAM FEED.</span>
            </h1>
            <p className="mt-4 text-foreground/70 max-w-xl">
              Share a bit about your brand, pick a few layouts, and get scroll-stopping posts
              ready to publish — copy, imagery, and scheduling in one flow.
            </p>
          </div>
          <div className="flex gap-3">
            <Input
              placeholder="Name your flow (e.g. Weekly Product Posts)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && createFlow()}
              className="max-w-sm border-2 border-foreground/20"
            />
            <Button
              onClick={createFlow}
              disabled={!newName.trim()}
              className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold"
            >
              <Plus className="w-4 h-4 mr-1.5" />
              New Flow
            </Button>
          </div>
          {flows.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">
                Your Flows
              </p>
              <div className="space-y-2">
                {flows.map((flow) => (
                  <div
                    key={flow.id}
                    className="flex items-center gap-4 p-4 rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition cursor-pointer group"
                    onClick={() => openFlow(flow)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-[#D4FF00]/20 border border-[#D4FF00]/40 flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-[#9AB800]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{flow.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(flow.selectedCanvases || []).length} layouts ·{' '}
                        {(flow.posts || []).length} posts ·{' '}
                        {(flow.posts || []).filter((p) => p.status === 'accepted').length} accepted
                      </p>
                    </div>
                    <span
                      className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                        flow.status === 'ready'
                          ? 'border-[#9AB800] text-[#9AB800]'
                          : 'border-foreground/20 text-foreground/40'
                      }`}
                    >
                      {flow.status || 'draft'}
                    </span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition" />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        deleteFlow(flow.id)
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ─── RENDER: FLOW EDITOR VIEW ─────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground flex flex-col">
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20 px-6 py-3 flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            saveFlow()
            router.push('?')
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <KandLogo size={26} />
        <span className="font-bold text-sm truncate max-w-36">{activeFlow?.name}</span>
        <div className="flex-1 flex justify-center">
          <StepBar step={step} maxStep={maxStep} onGoTo={goTo} />
        </div>
        <ThemeToggle />
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        <div
          key={step}
          className="animate-in fade-in slide-in-from-right-2 duration-300"
        >
          {step === 1 && (
            <StepBrand
              brand={brand}
              onChange={setBrand}
              extractedContext={extractedContext}
              onExtractedContextChange={setExtractedContext}
              onAdvance={advance}
            />
          )}
          {step === 2 && (
            <StepConfigure
              canvases={canvases}
              selectedCanvases={selectedCanvases}
              onToggleCanvas={(id) =>
                setSelectedCanvases((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                )
              }
              galleryId={galleryId}
              onSetGallery={setGalleryId}
              tone={tone}
              onSetTone={setTone}
              galleries={galleries}
              onRefreshGalleries={loadGalleries}
              carouselChance={carouselChance}
              onSetCarouselChance={setCarouselChance}
              language={language}
              onSetLanguage={setLanguage}
            />
          )}
          {step === 3 && (
            <StepGenerate
              flow={activeFlow}
              canvases={canvases}
              onGenerate={generate}
              onUpdatePost={updatePost}
              onRerender={rerenderPost}
              generating={generating}
              brand={brand}
              tone={tone}
              language={language}
              activeFlow={activeFlow}
            />
          )}
        </div>
      </div>

      <div className="sticky bottom-0 border-t-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-6 py-3 flex items-center justify-between">
        <Button
          variant="outline"
          className="border-2"
          onClick={async () => {
            if (step > 1) {
              await saveFlow()
              setStep((s) => s - 1)
            } else {
              await saveFlow()
              router.push('?')
            }
          }}
        >
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          {step === 1 ? 'Flows' : 'Back'}
        </Button>
        <span className="text-[11px] text-muted-foreground hidden sm:block">
          {step === 1 && 'The more you share, the sharper the copy'}
          {step === 2 &&
            `${selectedCanvases.length} layout${selectedCanvases.length !== 1 ? 's' : ''} selected · ${tone} tone`}
          {step === 3 &&
            `${(activeFlow?.posts || []).filter((p) => p.status === 'accepted').length} posts accepted`}
        </span>
        <Button
          disabled={!canAdvance()}
          className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold"
          onClick={async () => {
            await advance()
          }}
        >
          Continue <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  )
}
