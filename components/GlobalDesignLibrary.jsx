'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import GlobalDesignPreview from '@/components/GlobalDesignPreview'
import { DESIGN_TYPE_LABELS, getDesignType, designTypeLabel } from '@/lib/designs/global/imagery'
import { Loader2, Plus, Lock, ArrowLeft } from 'lucide-react'

async function api(path = '', method = 'GET', body) {
  const response = await fetch('/api/global-designs' + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || 'Could not load the design library')
  return data
}
const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })

export default function GlobalDesignLibrary() {
  const [admin, setAdmin] = useState(false), [login, setLogin] = useState(false), [key, setKey] = useState('')
  const [families, setFamilies] = useState([]), [records, setRecords] = useState([]), [active, setActive] = useState(null)
  const [draft, setDraft] = useState(null), [variantId, setVariantId] = useState(''), [editor, setEditor] = useState(null)
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [query, setQuery] = useState('')
  const [job, setJob] = useState(null)
  const [adding, setAdding] = useState(false), [references, setReferences] = useState([]), [json, setJson] = useState('')
  const refresh = async isAdmin => {
    setFamilies(await api())
    if (isAdmin) setRecords(await api('?admin=1'))
  }
  useEffect(() => { let active = true; (async () => { try { const session = await api('/session'); if (!active) return; setAdmin(session.admin); await refresh(session.admin) } catch (e) { if (active) setError(e.message) } })(); return () => { active = false } }, [])
  const run = async (label, fn) => { setBusy(label); setError(''); setNotice(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }
  const open = record => { setActive(record); setDraft(record.draft); setVariantId(record.draft.variants[0].id); setJson(JSON.stringify(record.draft.variants[0], null, 2)); setEditor(null); setAdding(false); setNotice('') }
  useEffect(() => {
    if (admin) { const id = localStorage.getItem('design-analysis-job'); if (id) setJob({ id, status: 'queued' }) }
  }, [admin])
  useEffect(() => {
    if (!admin || !job?.id) return
    let stopped = false, timer
    const poll = async () => {
      try {
        const next = await api(`/analysis-jobs/${job.id}`)
        if (stopped) return
        setJob(next)
        if (next.status === 'completed') {
          const record = await api(`/${next.familyId}`)
          if (stopped) return
          open(record); await refresh(true)
          if (stopped) return
          localStorage.removeItem('design-analysis-job'); setJob(null); setBusy(''); setNotice('Draft ready. All variations are saved and ready for review.')
          return
        }
        if (next.status === 'failed') { setBusy(''); return }
        setBusy('Creating design variations…')
        timer = setTimeout(poll, 2000)
      } catch (error) {
        if (!stopped) { setError(error.message); timer = setTimeout(poll, 5000) }
      }
    }
    void poll()
    return () => { stopped = true; clearTimeout(timer) }
  }, [admin, job?.id, job?.status])
  const startAnalysis = async (referenceImages, targetId) => {
    const next = await api('/analysis-jobs', 'POST', { referenceImages, targetId })
    localStorage.setItem('design-analysis-job', next.id); setJob(next)
  }
  const changeVariant = id => { setVariantId(id); setJson(JSON.stringify(draft.variants.find(v => v.id === id), null, 2)) }
  const saveDraft = async () => { const record = await api('/' + draft.id, 'PATCH', { family: draft, revision: active.revision }); setActive(record); setDraft(record.draft); await refresh(true); return record }
  const upload = files => run('Uploading references…', async () => {
    if (references.length + files.length > 30) throw Error('A family supports up to 30 references.')
    const added = []
    for (const file of files) { if (file.size > 6 * 1024 * 1024) throw Error(`${file.name} exceeds 6 MB.`); added.push(await api('/references', 'POST', { name: file.name, data: await readFile(file) })) }
    setReferences(prev => [...prev, ...added])
  })
  const variant = draft?.variants.find(v => v.id === variantId)
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/flow" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={14} />Back to flows</Link><h1 className="text-2xl font-semibold tracking-tight">Global Design Library</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Reusable design families. Choose your brand’s collection in Brand Personalization → Post design.</p></div><div className="flex gap-2">{admin ? <><Button disabled={!!busy} onClick={() => { setAdding(true); setActive(null); setDraft(null); setReferences([]) }}><Plus size={16} className="mr-2" />Add design</Button><Button variant="outline" onClick={() => run('Signing out…', async () => { await api('/session', 'DELETE'); setAdmin(false); setActive(null); setDraft(null); setAdding(false) })}>Sign out</Button></> : <Button variant="outline" onClick={() => setLogin(v => !v)}><Lock size={14} className="mr-2" />Admin</Button>}</div></header>
    {login && !admin && <form className="flex max-w-lg gap-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); run('Signing in…', async () => { await api('/session', 'POST', { key }); setKey(''); setAdmin(true); setLogin(false); await refresh(true) }) }}><Input aria-label="Admin key" type="password" autoComplete="current-password" placeholder="Admin key" value={key} onChange={e => setKey(e.target.value)} /><Button disabled={!!busy || !key}>Sign in</Button></form>}
    {job && <section aria-live="polite" className="space-y-2 rounded-lg border p-4 text-sm"><p>{job.status === 'failed' ? 'Analysis needs attention' : job.status === 'retrying' ? 'Waiting for provider recovery…' : job.stage || 'Starting analysis…'}</p><progress className="w-full" max={job.total || 1} value={job.completed || 0} /><p>{job.completed || 0} / {job.total || '…'} stages completed. Progress is saved if you refresh.</p>{job.error && <p>{job.error}</p>}{job.status === 'failed' && <Button onClick={() => run('Resuming analysis…', async () => { setJob(await api(`/analysis-jobs/${job.id}`, 'POST', {})) })}>Resume analysis</Button>}</section>}
    {busy && !job && <p role="status" className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm"><Loader2 size={16} className="animate-spin" />{busy}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {adding && admin && <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">Create a design identity</h2><p className="text-sm text-muted-foreground">Upload 2 or more related examples. Their typography, color usage, shadows and decoration inspire unique variations for AI cutout, background photo and no imagery. The system generates a name from the visual style; you can rename it afterward.</p><input aria-label="Upload design references" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!!busy} onChange={e => { upload([...e.target.files]); e.target.value = '' }} /><div className="flex flex-wrap gap-3">{references.map(ref => <div key={ref.id} className="w-28"><img src={ref.url} alt={ref.name} className="h-32 w-full rounded border object-contain" /><button className="mt-1 text-xs underline" onClick={() => setReferences(prev => prev.filter(r => r.id !== ref.id))}>Remove</button></div>)}</div><Button disabled={!!busy || references.length < 2} onClick={() => run(`Analyzing ${references.length} references and creating identity-inspired variations…`, async () => { await startAnalysis(references) })}>Analyze and create draft</Button></section>}
    {draft && admin && <section className="grid gap-6 rounded-xl border p-5 lg:grid-cols-[320px_1fr]">
      <div className="space-y-4"><GlobalDesignPreview family={draft} variantId={variantId} /><select aria-label="Edit variant" className="w-full rounded border bg-background p-2" value={variantId} onChange={e => changeVariant(e.target.value)}>{['cutout', 'background', 'none'].map(mode => <optgroup key={mode} label={DESIGN_TYPE_LABELS[mode]}>{draft.variants.filter(v => (v.imagery || getDesignType(draft)) === mode).map(v => <option key={v.id} value={v.id}>{v.name} · {v.role}</option>)}</optgroup>)}</select><Button variant="outline" className="w-full" disabled={!!busy} onClick={() => run('Opening Canvas editor…', async () => { await saveDraft(); setEditor(await api(`/${draft.id}/editor`, 'POST', { variantId })) })}>Edit in Canvas</Button>{editor && <div className="space-y-2 rounded-lg bg-muted p-3 text-sm"><a className="block underline" href={`/editor/${editor.id}`} target="_blank" rel="noreferrer">Open editing canvas ↗</a><p className="text-xs text-muted-foreground">Move and resize elements, then save in Canvas. Return here to apply your edits to this draft.</p><Button size="sm" disabled={!!busy} onClick={() => run('Applying Canvas edits…', async () => { const result = await api(`/${draft.id}/apply-editor`, 'POST', { canvasId: editor.id }); open(result); await refresh(true); setNotice('Canvas edits applied to draft. Review, then publish.') })}>Apply saved Canvas edits</Button></div>}</div>
      <div className="space-y-4"><div className="flex justify-between gap-4"><h2 className="font-semibold">Edit family · {active.status}</h2><span className="rounded-full bg-muted px-2 py-1 text-xs">{designTypeLabel(draft)}</span><button onClick={() => { setDraft(null); setActive(null) }} className="text-sm underline">Close</button></div><label className="block text-sm">Name<Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="block text-sm">Categories, separated by commas<Input value={draft.tags.join(', ')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label><label className="block text-sm">Description<Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Variant name<Input value={variant?.name || ''} onChange={e => setDraft({ ...draft, variants: draft.variants.map(v => v.id === variantId ? { ...v, name: e.target.value } : v) })} /></label><label className="text-sm">Variant role<select className="block h-10 w-full rounded border bg-background px-2" value={variant?.role} onChange={e => setDraft({ ...draft, variants: draft.variants.map(v => v.id === variantId ? { ...v, role: e.target.value } : v) })}>{['cover','content','image-content','list','quote','cta'].map(role => <option key={role}>{role}</option>)}</select></label></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => { const next = { ...structuredClone(variant), id: 'variant-' + crypto.randomUUID(), name: 'New variant', role: 'content' }; setDraft({ ...draft, variants: [...draft.variants, next] }); setVariantId(next.id); setJson(JSON.stringify(next, null, 2)) }}>Duplicate as new variant</Button><Button variant="outline" size="sm" disabled={draft.variants.length <= 2} onClick={() => { const next = draft.variants.filter(v => v.id !== variantId); setDraft({ ...draft, variants: next }); setVariantId(next[0].id); setJson(JSON.stringify(next[0], null, 2)) }}>Remove variant</Button></div>
        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run('Extracting design identity and generating variations…', async () => { await startAnalysis(draft.referenceImages, draft.id) })}>Regenerate from identity</Button>
        <details><summary className="cursor-pointer text-sm">Reference analysis and original images</summary><p className="my-3 whitespace-pre-line text-sm text-muted-foreground">{draft.analysis}</p><div className="flex flex-wrap gap-2">{draft.referenceImages.map(ref => <a key={ref.id} href={ref.url} target="_blank" rel="noreferrer"><img src={ref.url} alt={ref.name} className="h-40 rounded border" /></a>)}</div></details>
        <details onToggle={e => { if (e.currentTarget.open) setJson(JSON.stringify(variant, null, 2)) }}><summary className="cursor-pointer text-sm">Advanced: semantic slots and template data</summary><p className="my-2 text-xs text-muted-foreground">Use brand.* color/font tokens and {'{{headline}}'}, {'{{body}}'}, {'{{image.primary}}'} slots. Canvas edits keep existing bindings.</p><textarea aria-label="Variant template JSON" value={json} onChange={e => setJson(e.target.value)} className="h-64 w-full rounded border bg-background p-3 font-mono text-xs" /><Button size="sm" variant="outline" onClick={() => run('Applying variant data…', async () => { const next = JSON.parse(json); if (next.id !== variantId) throw Error('Keep the variant ID unchanged.'); const { variantSchema } = await import('@/lib/designs/global/types'); const valid = variantSchema.parse(next); setDraft({ ...draft, variants: draft.variants.map(v => v.id === variantId ? valid : v) }) })}>Apply variant data</Button></details>
        <div className="flex flex-wrap gap-2 border-t pt-4"><Button disabled={!!busy} onClick={() => run('Saving draft…', async () => { await saveDraft(); setNotice('Draft saved. Published versions remain unchanged.') })}>Save draft</Button><Button disabled={!!busy} onClick={() => run('Publishing reviewed family…', async () => { const saved = await saveDraft(); const result = await api(`/${draft.id}/publish`, 'POST', { revision: saved.revision }); open(result); await refresh(true); setNotice('Published. Brands can now import this version.') })}>Publish</Button>{active.status === 'published' && <Button variant="outline" disabled={!!busy} onClick={() => run('Unpublishing…', async () => { await api(`/${draft.id}/unpublish`, 'POST', { revision: active.revision }); open(await api('/' + draft.id)); await refresh(true) })}>Unpublish</Button>}<Button variant="destructive" disabled={!!busy} onClick={() => { if (window.confirm('Delete this family from the library? Existing brand imports and posts will keep their saved version.')) run('Deleting family…', async () => { await api('/' + draft.id, 'DELETE', { revision: active.revision }); setDraft(null); setActive(null); await refresh(true) }) }}>Delete</Button></div>
      </div>
    </section>}
    <Input aria-label="Search design library" placeholder="Search families or categories" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{(admin ? records.map(r => ({ family: r.draft, record: r })) : families.map(family => ({ family }))).filter(({ family }) => `${family.name} ${family.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(({ family, record }) => <article key={family.id} className="space-y-3 rounded-xl border p-4"><GlobalDesignPreview family={family} /><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{family.name}</h2>{record && <span className="rounded-full bg-muted px-2 py-1 text-xs">{record.status}</span>}</div><span className="inline-block rounded-full bg-muted px-2 py-1 text-xs">{designTypeLabel(family)}</span><p className="text-sm text-muted-foreground">{family.description}</p><p className="text-xs text-muted-foreground">{family.variants.length} variants · {family.tags.join(' · ')}</p>{admin && <Button variant="outline" className="w-full" onClick={() => open(record)}>Review and edit</Button>}</article>)}</div>
  </main>
}
