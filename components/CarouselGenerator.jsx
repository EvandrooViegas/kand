'use client'

import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'

async function api(path, method = 'GET', body) {
  const response = await fetch('/api/global-designs' + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const result = await response.json()
  if (!response.ok) throw Error(result.error || 'Unable to load carousel generation.')
  return result
}
const fileData = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error('Could not read reference image.')); reader.readAsDataURL(file) })
const stageLabel = stage => {
  if (/^SLIDE_\d+$/.test(stage)) return `Generating slide ${stage.slice(6)}`
  if (/^PLANNING_SLIDE_/.test(stage)) return `Planning slide ${stage.slice(15)}`
  return ({ QUEUED: 'Starting generation', ANALYZING_REFERENCES: 'Analyzing references', BUILDING_DESIGN_DNA: 'Building visual identity', ANALYZING_CONTENT: 'Interpreting carousel content', CREATING_CREATIVE_DIRECTION: 'Creating creative direction', CAROUSEL_VISUAL_SYSTEM: 'Establishing visual consistency', PLANNING_CAROUSEL: 'Planning carousel', BUILDING_PROMPTS: 'Building generation instructions', SAVING_RESULT: 'Saving carousel', COMPLETED: 'Carousel ready' })[stage] || stage
}

export default function CarouselGenerator({ studies = [], initialReferences = [], onCompleted }) {
  const [references, setReferences] = useState(initialReferences), [studyId, setStudyId] = useState('')
  const [content, setContent] = useState(''), [instructions, setInstructions] = useState('')
  const [uploading, setUploading] = useState(false), [submitting, setSubmitting] = useState(false), [error, setError] = useState('')
  const [run, setRun] = useState(null)
  const request = useRef(null), notified = useRef(null), completedCallback = useRef(onCompleted)
  completedCallback.current = onCompleted
  const active = run && !['completed', 'failed'].includes(run.status)
  useEffect(() => { if (initialReferences.length) { setReferences(initialReferences); setStudyId('') } }, [initialReferences])
  useEffect(() => { const id = localStorage.getItem('carousel-run'); if (id) setRun({ id, status: 'queued', stage: 'QUEUED' }) }, [])
  useEffect(() => {
    if (!run?.id) return
    let disposed = false, timer
    const poll = async () => {
      try {
        const next = await api(`/carousel-runs/${run.id}`)
        if (disposed) return
        setRun(next); setError('')
        if (next.status === 'completed' && notified.current !== next.id) { notified.current = next.id; Promise.resolve(completedCallback.current?.()).catch(failure => setError(failure.message)) }
        if (!['completed', 'failed'].includes(next.status)) timer = setTimeout(poll, 2000)
      } catch (failure) {
        if (!disposed) { setError(failure.message); timer = setTimeout(poll, 5000) }
      }
    }
    void poll()
    return () => { disposed = true; clearTimeout(timer) }
  }, [run?.id, run?.status])
  async function upload(files) {
    setUploading(true); setError('')
    try {
      if (references.length + files.length > 30) throw Error('Upload at most 30 reference images.')
      for (const file of files) {
        if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 6 * 1024 * 1024) throw Error('Each reference must be a PNG, JPEG or WebP under 6 MB.')
        const ref = await api('/references', 'POST', { name: file.name, data: await fileData(file) })
        setReferences(current => [...current, ref])
      }
    } catch (failure) { setError(failure.message) } finally { setUploading(false) }
  }
  async function generate(event) {
    event.preventDefault(); setSubmitting(true); setError('')
    const payload = { ...(studyId ? { studyId } : { references }), carouselContent: content, optionalInstructions: instructions }
    const fingerprint = JSON.stringify(payload)
    if (run?.status === 'completed' || request.current?.fingerprint !== fingerprint) request.current = { fingerprint, id: 'carousel_' + crypto.randomUUID() }
    try {
      const next = await api('/carousel-runs', 'POST', { ...payload, requestId: request.current.id })
      localStorage.setItem('carousel-run', next.id); setRun(next)
    } catch (failure) { setError(failure.message) } finally { setSubmitting(false) }
  }
  return <section id="carousel-generator" className="space-y-5 rounded-xl border bg-background p-5 sm:p-6">
    <div><h2 className="text-xl font-semibold">Generate an Instagram carousel</h2><p className="mt-1 text-sm text-muted-foreground">Add your references and copy. We’ll study the visual identity, plan the slides, and generate the full carousel. 1080 × 1350 · 4:5.</p></div>
    <form onSubmit={generate} className="space-y-4">
      <fieldset disabled={!!active || uploading || submitting} className="space-y-4 disabled:opacity-70">
        <label className="block text-sm font-medium">Design references<select className="mt-1 block w-full rounded border bg-background p-2" value={studyId} onChange={e => setStudyId(e.target.value)}><option value="">Upload reference images</option>{studies.map(record => <option key={record.id} value={record.id}>{record.study.name} (saved study)</option>)}</select></label>
        {!studyId && <div className="space-y-3"><input aria-label="Reference images" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={e => { upload([...e.target.files]); e.target.value = '' }} /><p className="text-xs text-muted-foreground">One or more images. Multiple related references provide stronger evidence of the visual identity.</p><div className="flex flex-wrap gap-3">{references.map(ref => <div key={ref.id} className="w-24"><img src={ref.url} alt={ref.name} className="h-28 w-full rounded border object-contain" /><button type="button" className="text-xs underline" onClick={() => setReferences(current => current.filter(r => r.id !== ref.id))}>Remove</button></div>)}</div></div>}
        {studyId && <p className="text-sm text-muted-foreground">Uses the saved Design DNA without re-analyzing its images.</p>}
        <label className="block text-sm font-medium">Carousel content<textarea required maxLength={12000} className="mt-1 block min-h-56 w-full rounded border bg-background p-3 font-normal" value={content} onChange={e => setContent(e.target.value)} placeholder={'Slide 1\nYour opening message\n\nSlide 2\nYour next point\n\nSlide 3\nYour closing message'} /></label>
        <p className="text-xs text-muted-foreground">Use “Slide 1”, “Slide 2”, etc. to keep your slide boundaries, or paste several paragraphs and let the planner divide them. 2–20 slides. Your wording is preserved.</p>
        <label className="block text-sm font-medium">Optional instructions<textarea maxLength={2000} className="mt-1 block min-h-20 w-full rounded border bg-background p-3 font-normal" value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Any additional design preferences" /></label>
      </fieldset>
      <Button type="submit" disabled={!!active || uploading || submitting || !content.trim() || (!studyId && !references.length)}>{uploading ? 'Uploading references…' : submitting ? 'Starting generation…' : active ? 'Generating carousel…' : 'Generate Carousel'}</Button>
    </form>
    {error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">{error}</p>}
    {run && <div className="space-y-3 border-t pt-4" aria-live="polite"><h3 className="font-semibold">{run.status === 'failed' ? 'Generation needs attention' : stageLabel(run.stage)}{active && run.progress?.slide ? ` of ${run.progress.total}` : ''}</h3><p className="text-xs text-muted-foreground">Progress is saved. Refreshing this page resumes the same run.</p>
      <ol className="grid gap-1 text-sm sm:grid-cols-2">{run.stages?.map(stage => <li key={stage.stage}>{stage.status === 'completed' ? '✓' : stage.status === 'failed' ? '!' : '◌'} {stageLabel(stage.stage)}</li>)}</ol>
      {run.error && <p role="alert" className="text-sm">{run.error}</p>}
      {run.status === 'failed' && <Button variant="outline" disabled={submitting} onClick={async () => { setSubmitting(true); try { setRun(await api(`/carousel-runs/${run.id}`, 'POST', {})) } catch (failure) { setError(failure.message) } finally { setSubmitting(false) } }}>Retry failed stage</Button>}
      {!!run.slides?.length && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{run.slides.map(slide => <figure key={slide.slideNumber} className="space-y-2"><a href={slide.url} target="_blank" rel="noreferrer"><img src={slide.url} width={1080} height={1350} alt={`Generated carousel slide ${slide.slideNumber}`} className="w-full rounded border" /></a><figcaption className="flex justify-between text-sm"><span>Slide {slide.slideNumber}</span><a className="underline" href={slide.url} download={`carousel-${run.id}-${slide.slideNumber}.png`}>Download</a></figcaption></figure>)}</div>}
      {run.debug && <details className="rounded border p-3"><summary className="cursor-pointer text-sm font-medium">Generation Debug</summary><p className="my-2 break-all font-mono text-xs">{run.id}</p>{Object.entries(run.debug.stages || {}).map(([name, info]) => <details key={name} className="border-t py-2"><summary className="cursor-pointer text-sm">{stageLabel(name)} · {info.status} {info.durationMs !== undefined ? `· ${(info.durationMs / 1000).toFixed(1)}s` : ''}</summary><pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words bg-muted p-3 text-xs">{JSON.stringify(run.debug.outputs?.[name] ?? info, null, 2)}</pre></details>)}</details>}
    </div>}
  </section>
}
