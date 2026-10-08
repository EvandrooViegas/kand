'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import GlobalDesignPreview, { StudySamples } from '@/components/GlobalDesignPreview'
import DesignStudyEditor, { imageryLabel } from '@/components/DesignStudyEditor'
import { familyImagery, familyGrammar } from '@/lib/designs/global/study'
import { Loader2, Plus, Lock, ArrowLeft } from 'lucide-react'
import { shortName, usePopup } from '@/components/app/popup'

async function api(path = '', method = 'GET', body) {
  const response = await fetch('/api/global-designs' + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}) })
  const data = await response.json()
  if (!response.ok) throw Error(data.error || 'Could not load the design library')
  return data
}
// Blank lines kept while typing in rule lists are dropped before saving.
const tidy = family => family.study ? { ...family, study: Object.fromEntries(Object.entries(family.study).map(([k, v]) => [k, Array.isArray(v) ? v.map(s => String(s).trim()).filter(Boolean) : v])) } : family
const readFile = file => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file) })

export default function GlobalDesignLibrary() {
  const popup = usePopup()
  const [admin, setAdmin] = useState(false), [login, setLogin] = useState(false), [key, setKey] = useState('')
  const [families, setFamilies] = useState([]), [records, setRecords] = useState([]), [active, setActive] = useState(null)
  const [draft, setDraft] = useState(null), [reconstructionId, setReconstructionId] = useState('')
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [notice, setNotice] = useState(''), [query, setQuery] = useState('')
  const [adding, setAdding] = useState(false), [references, setReferences] = useState([]), [json, setJson] = useState('')
  const refresh = async isAdmin => {
    setFamilies(await api())
    if (isAdmin) setRecords(await api('?admin=1'))
  }
  useEffect(() => { let active = true; (async () => { try { const session = await api('/session'); if (!active) return; setAdmin(session.admin); await refresh(session.admin) } catch (e) { if (active) setError(e.message) } })(); return () => { active = false } }, [])
  const run = async (label, fn) => { setBusy(label); setError(''); setNotice(''); try { await fn() } catch (e) { setError(e.message) } finally { setBusy('') } }
  const open = record => { setActive(record); setDraft(record.draft); setReconstructionId(record.draft.variants?.[0]?.id || ''); setJson(''); setAdding(false); setNotice('') }
  const saveDraft = async () => { const record = await api('/' + draft.id, 'PATCH', { family: tidy(draft), revision: active.revision }); setActive(record); setDraft(record.draft); await refresh(true); return record }
  const upload = files => run('Uploading references…', async () => {
    if (references.length + files.length > 30) throw Error('A family supports up to 30 references.')
    const added = []
    for (const file of files) { if (file.size > 6 * 1024 * 1024) throw Error(`${file.name} exceeds 6 MB.`); added.push(await api('/references', 'POST', { name: file.name, data: await readFile(file) })) }
    setReferences(prev => [...prev, ...added])
  })
  const reconstruction = draft?.variants?.find(v => v.id === reconstructionId)
  return <main className="mx-auto max-w-7xl space-y-6 p-5 sm:p-8">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><Link href="/app" className="mb-4 inline-flex items-center gap-2 text-sm text-muted-foreground"><ArrowLeft size={14} />Back to app</Link><h1 className="text-2xl font-semibold tracking-tight">Global Design Library</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Reusable design studies: visual languages that compose new posts in each brand’s colors, fonts and logo. Choose your brand’s collection in Brand Personalization → Post design.</p></div><div className="flex gap-2">{admin ? <><Button disabled={!!busy} onClick={() => { setAdding(true); setActive(null); setDraft(null); setReferences([]) }}><Plus size={16} className="mr-2" />Add design</Button><Button variant="outline" onClick={() => run('Signing out…', async () => { await api('/session', 'DELETE'); setAdmin(false); setActive(null); setDraft(null); setAdding(false) })}>Sign out</Button></> : <Button variant="outline" onClick={() => setLogin(v => !v)}><Lock size={14} className="mr-2" />Admin</Button>}</div></header>
    {login && !admin && <form className="flex max-w-lg gap-3 rounded-xl border p-4" onSubmit={e => { e.preventDefault(); run('Signing in…', async () => { await api('/session', 'POST', { key }); setKey(''); setAdmin(true); setLogin(false); await refresh(true) }) }}><Input aria-label="Admin key" type="password" autoComplete="current-password" placeholder="Admin key" value={key} onChange={e => setKey(e.target.value)} /><Button disabled={!!busy || !key}>Sign in</Button></form>}
    {busy && <p role="status" className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm"><Loader2 size={16} className="animate-spin" />{busy}</p>}
    {error && <p role="alert" className="rounded-lg border border-red-200 p-4 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="text-sm text-green-700">{notice}</p>}
    {adding && admin && <section className="space-y-4 rounded-xl border p-5"><h2 className="font-semibold">Study a new design</h2><p className="text-sm text-muted-foreground">Upload one example, or several related ones for a richer study. The references are studied together: what repeats becomes recurring rules, what changes becomes flexible rules. The result is a visual language that composes new layouts for any brand; references are never reused as templates. The system names the style; you can rename it afterward.</p><input aria-label="Upload design references" type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={!!busy} onChange={e => { upload([...e.target.files]); e.target.value = '' }} /><div className="flex flex-wrap gap-3">{references.map(ref => <div key={ref.id} className="w-28"><img src={ref.url} alt={ref.name} className="h-32 w-full rounded border object-contain" /><button className="mt-1 text-xs underline" onClick={() => setReferences(prev => prev.filter(r => r.id !== ref.id))}>Remove</button></div>)}</div><Button disabled={!!busy || !references.length} onClick={() => run(`Studying ${references.length} reference${references.length === 1 ? '' : 's'}…`, async () => { const family = await api('/analyze', 'POST', { referenceImages: references }); const record = await api('', 'POST', family); open(record); await refresh(true); setNotice('Draft created. Review the study and the sample compositions before publishing.') })}>Analyze and create draft</Button></section>}
    {draft && admin && <section className="grid gap-6 rounded-xl border p-5 lg:grid-cols-[340px_1fr]">
      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <div><h3 className="mb-2 text-sm font-medium">References</h3><div className="flex flex-wrap gap-2">{draft.referenceImages.map(ref => <a key={ref.id} href={ref.url} target="_blank" rel="noreferrer"><img src={ref.url} alt={ref.name} className="h-28 rounded border" /></a>)}</div></div>
        <div><h3 className="text-sm font-medium">Sample compositions</h3><p className="mb-2 text-xs text-muted-foreground">Generated from the study with sample copy. Layouts vary; the visual language stays. Click one to enlarge.</p><StudySamples family={draft} /></div>
      </div>
      <div className="space-y-4"><div className="flex justify-between gap-4"><h2 className="font-semibold">Edit design · {active.status}</h2><button onClick={() => { setDraft(null); setActive(null) }} className="text-sm underline">Close</button></div><label className="block text-sm">Name<Input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} /></label><label className="block text-sm">Description<Input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} /></label><label className="block text-sm">Categories, separated by commas<Input value={draft.tags.join(', ')} onChange={e => setDraft({ ...draft, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></label>
        <Button variant="outline" size="sm" disabled={!!busy} onClick={() => run('Studying the references again…', async () => { const rebuilt = await api('/analyze', 'POST', { referenceImages: draft.referenceImages }); setDraft({ ...rebuilt, id: draft.id, version: draft.version }); setReconstructionId(rebuilt.variants?.[0]?.id || ''); setNotice('Study rebuilt with an automatic name. Review and save to keep these changes; published versions are unchanged.') })}>Rebuild from references</Button>
        <DesignStudyEditor family={draft} onChange={setDraft} />
        <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Advanced: reference reconstructions and raw data</summary>
          <p className="my-2 text-xs text-muted-foreground">Reconstructions show how the importer read each reference. They are evidence for review only; generation composes from the study above.</p>
          {draft.variants?.length ? <div className="grid gap-3 sm:grid-cols-[200px_1fr]"><div className="space-y-2"><select aria-label="Reference reconstruction" className="w-full rounded border bg-background p-2 text-sm" value={reconstructionId} onChange={e => setReconstructionId(e.target.value)}>{draft.variants.map((v, i) => <option key={v.id} value={v.id}>Reference {i + 1}</option>)}</select>{reconstruction && <GlobalDesignPreview family={draft} reconstruction={reconstruction} />}</div><p className="whitespace-pre-line text-xs text-muted-foreground">{draft.analysis}</p></div> : <p className="text-sm text-muted-foreground">No reconstructions stored.</p>}
          <details className="mt-3" onToggle={e => { if (e.currentTarget.open) setJson(JSON.stringify(familyGrammar(draft), null, 2)) }}><summary className="cursor-pointer text-sm">Grammar JSON</summary><textarea aria-label="Design grammar JSON" value={json} onChange={e => setJson(e.target.value)} className="mt-2 h-64 w-full rounded border bg-background p-3 font-mono text-xs" /><Button size="sm" variant="outline" onClick={() => run('Applying grammar…', async () => { const { grammarSchema } = await import('@/lib/designs/global/types'); const grammar = grammarSchema.parse(JSON.parse(json)); setDraft({ ...draft, study: { ...(draft.study || {}), imagery: familyImagery(draft), grammar } }) })}>Apply grammar</Button></details>
        </details>
        <div className="flex flex-wrap gap-2 border-t pt-4"><Button disabled={!!busy} onClick={() => run('Saving draft…', async () => { await saveDraft(); setNotice('Draft saved. Published versions remain unchanged.') })}>Save draft</Button><Button disabled={!!busy} onClick={() => run('Publishing reviewed design…', async () => { const saved = await saveDraft(); const result = await api(`/${draft.id}/publish`, 'POST', { revision: saved.revision }); open(result); await refresh(true); setNotice('Published. Brands can now import this version.') })}>Publish</Button>{active.status === 'published' && <Button variant="outline" disabled={!!busy} onClick={() => run('Unpublishing…', async () => { await api(`/${draft.id}/unpublish`, 'POST', { revision: active.revision }); open(await api('/' + draft.id)); await refresh(true) })}>Unpublish</Button>}<Button variant="destructive" disabled={!!busy} onClick={async () => { if (await popup.confirm({ title: draft.name ? `Delete “${shortName(draft.name)}” from the library?` : 'Delete this design from the library?', description: 'Existing brand imports and posts keep their saved version.', tone: 'danger', confirmLabel: 'Delete design' })) run('Deleting design…', async () => { await api('/' + draft.id, 'DELETE', { revision: active.revision }); setDraft(null); setActive(null); await refresh(true) }) }}>Delete</Button></div>
      </div>
    </section>}
    <Input aria-label="Search design library" placeholder="Search families or categories" value={query} onChange={e => setQuery(e.target.value)} />
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">{(admin ? records.map(r => ({ family: r.draft, record: r })) : families.map(family => ({ family }))).filter(({ family }) => `${family.name} ${family.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(({ family, record }) => <article key={family.id} className="space-y-3 rounded-xl border p-4"><GlobalDesignPreview family={family} /><div className="flex items-center justify-between gap-2"><h2 className="font-semibold">{family.name}</h2>{record && <span className="rounded-full bg-muted px-2 py-1 text-xs">{record.status}</span>}</div><p className="text-sm text-muted-foreground">{family.description}</p><p className="text-xs text-muted-foreground">Imagery: {imageryLabel(familyImagery(family).mode)} · {familyGrammar(family).compositions.length} composition moves · {family.tags.join(' · ')}</p>{admin && <Button variant="outline" className="w-full" onClick={() => open(record)}>Review and edit</Button>}</article>)}</div>
  </main>
}
