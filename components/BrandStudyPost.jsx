'use client'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

export async function brandCarouselRequest(query, body) {
  const response = await fetch('/api/brand-carousel' + (body ? '' : '?' + new URLSearchParams(query)), body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {})
  const value = await response.json()
  if (!response.ok) throw Error(value?.error || 'Carousel request failed.')
  return value
}
export async function startBrandStudyPost({ flowId, designId, idea, brandContext, copy, requestId, onCopy }) {
  let currentCopy = copy
  if (!Array.isArray(currentCopy?.slides) || currentCopy.slides.length < 2) {
    const response = await fetch('/api/generate-copywriting', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandContext, idea: { ...idea, format: 'carousel' } }) })
    currentCopy = await response.json()
    if (!response.ok) throw Error(currentCopy.error || 'Copy generation failed.')
    onCopy?.(currentCopy)
  }
  return brandCarouselRequest(null, { flowId, designId, ideaId: idea.id, copy: currentCopy, requestId })
}

export default function BrandStudyPost({ flowId, design, idea, brandContext, copyState, onCopyDone, onDesignDone, batchRunning = false }) {
  const [run, setRun] = useState(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('')
  const callbacks = useRef({ onCopyDone, onDesignDone }); callbacks.current = { onCopyDone, onDesignDone }
  const requestId = useRef(null), delivered = useRef(null)
  const query = { flowId, designId: design.id, ideaId: idea.id }
  useEffect(() => { let stopped = false; brandCarouselRequest(query).then(value => { if (!stopped) setRun(value) }).catch(e => { if (!stopped) setError(e.message) }).finally(() => { if (!stopped) setLoading(false) }); return () => { stopped = true } }, [flowId, design.id, idea.id])
  useEffect(() => {
    if (!run?.id) return
    let stopped = false, timer
    const poll = async () => {
      try {
        const next = await brandCarouselRequest({ ...query, runId: run.id })
        if (stopped || !next) return
        setRun(next); setError('')
        if (next.status === 'completed' && delivered.current !== next.id) { delivered.current = next.id; callbacks.current.onDesignDone(idea.id, { loading: false, error: null, canvas: next.result.canvas }) }
        if (!['completed', 'failed'].includes(next.status)) timer = setTimeout(poll, 2000)
      } catch (e) { if (!stopped) { setError(e.message); timer = setTimeout(poll, 5000) } }
    }
    void poll(); return () => { stopped = true; clearTimeout(timer) }
  }, [run?.id, run?.status, flowId, design.id, idea.id])
  const active = run && !['completed', 'failed'].includes(run.status)
  async function generate() {
    setBusy(true); setError('')
    try {
      if (run?.status === 'failed') setRun(await brandCarouselRequest(null, { ...query, runId: run.id }))
      else {
        requestId.current ||= 'carousel_' + crypto.randomUUID()
        const next = await startBrandStudyPost({ flowId, designId: design.id, idea, brandContext, copy: copyState?.copy, requestId: requestId.current, onCopy: copy => callbacks.current.onCopyDone(idea.id, { loading: false, error: null, copy }) })
        setRun(next); requestId.current = null
      }
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  return <section className="space-y-4 rounded-xl border p-5">
    <div><h3 className="font-semibold">{idea.topic}</h3><p className="text-sm text-muted-foreground">{design.name} · Design Study · 4:5 carousel</p></div>
    {copyState?.copy?.slides && <details><summary className="cursor-pointer text-sm">Carousel copy</summary>{copyState.copy.slides.map((slide, i) => <p key={i} className="my-2 whitespace-pre-line text-sm">{[slide.headline, slide.body, slide.cta].filter(Boolean).join('\n')}</p>)}</details>}
    <Button disabled={busy || loading || !!active || batchRunning} onClick={generate}>{loading ? 'Loading saved progress…' : busy ? 'Preparing carousel…' : active ? 'Generating carousel…' : run?.status === 'failed' ? 'Retry failed stage' : run?.status === 'completed' ? 'Generate another version' : 'Generate post'}</Button>
    {run && <div aria-live="polite" className="space-y-2 text-sm"><p>{run.status === 'completed' ? 'Carousel ready' : run.stage?.replaceAll('_', ' ').toLowerCase()}{run.progress?.total ? ` · ${run.progress.slide || ''}/${run.progress.total}` : ''}</p><p className="text-muted-foreground">Progress is saved automatically.</p>{run.error && <p role="alert">{run.error}</p>}</div>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {!!run?.slides?.length && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">{run.slides.map(slide => <a key={slide.slideNumber} href={slide.url} target="_blank" rel="noreferrer"><img src={slide.url} alt={`Slide ${slide.slideNumber}`} className="w-full rounded" /></a>)}</div>}
    {run?.status === 'completed' && <div className="space-y-2"><a className="text-sm underline" href={`/carousel/${run.result.canvas.id}`}>Open carousel</a><p className="text-xs text-muted-foreground">AI-generated slides are saved as image layers; text inside these images is not individually editable.</p></div>}
    {run?.debug && <details><summary className="cursor-pointer text-sm">Generation Debug</summary><pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-muted p-3 text-xs">{JSON.stringify(run.debug, null, 2)}</pre></details>}
  </section>
}
