'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import GlobalDesignPreview from '@/components/GlobalDesignPreview'
import { Check, Loader2 } from 'lucide-react'

export default function BrandDesignStudio({ flowId, brand, onChange }) {
  const [families, setFamilies] = useState([]), [selected, setSelected] = useState([])
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [variants, setVariants] = useState({}), [query, setQuery] = useState('')
  useEffect(() => {
    let active = true
    setLoading(true); setError('')
    const read = async r => { const data = await r.json(); if (!r.ok) throw Error(data.error); return data }
    Promise.all([fetch('/api/global-designs').then(read), flowId ? fetch(`/api/global-designs/brand?flowId=${encodeURIComponent(flowId)}`).then(read) : Promise.resolve([])])
      .then(([published, imported]) => {
        if (!active) return
        const pinned = new Map(imported.map(item => [item.family.id, item.family]))
        setFamilies([...published.map(f => pinned.get(f.id) || f), ...imported.filter(item => !published.some(f => f.id === item.family.id)).map(item => item.family)])
        setSelected(imported.map(item => item.family.id))
      }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [flowId])
  const save = async (familyIds = selected) => {
    setBusy(true); setError(''); setNotice('')
    try {
      const response = await fetch('/api/brand-designs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ flowId, familyIds }) })
      const data = await response.json()
      if (!response.ok) throw Error(data.error)
      const verifyResponse = await fetch(`/api/global-designs/brand?flowId=${encodeURIComponent(flowId)}`, { cache: 'no-store' })
      const imported = await verifyResponse.json()
      if (!verifyResponse.ok) throw Error(imported.error || 'Could not verify the saved designs.')
      const savedIds = imported.map(item => item.family.id)
      if (familyIds.some(id => !savedIds.includes(id)) || savedIds.length !== familyIds.length) throw Error('The design selection was not retained. Reload and try again.')
      setSelected(savedIds)
      onChange({ ...brand, designs: data.brandContext.designs, designLibraryVersion: 1 })
      setNotice(`${savedIds.length} brand designs saved and verified. New posts will use these families.`)
    } catch (e) { setError(e.message) } finally { setBusy(false) }
  }
  const toggleFamily = familyId => {
    setNotice(''); setError('')
    const removing = selected.includes(familyId)
    if (removing && selected.length <= 3) {
      setError('Keep at least 3 designs. Select a replacement before removing this one.')
      return
    }
    const next = removing ? selected.filter(id => id !== familyId) : [...selected, familyId]
    setSelected(next)
    if (next.length >= 3) void save(next)
  }
  return <section className="rounded-xl border bg-white p-5 sm:p-6 dark:bg-slate-950">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="text-base font-semibold">Your brand designs</h3><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Choose at least 3 Global Designs. Their layouts stay consistent while colors, fonts, and logo follow your brand.</p></div><Link href="/design-library" className="text-sm underline underline-offset-4">Global Design Library</Link></div>
    <div className="my-5 flex flex-wrap items-center gap-3"><input aria-label="Search global designs" value={query} onChange={e => setQuery(e.target.value)} placeholder="Search designs or categories" className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm" /><span className="text-sm text-muted-foreground">{selected.length} selected · minimum 3</span></div>
    {loading && <p role="status" className="py-12 text-center text-sm text-muted-foreground">Loading design families…</p>}
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">{families.filter(f => `${f.name} ${f.tags.join(' ')}`.toLowerCase().includes(query.toLowerCase())).map(family => <article key={family.id} className={`min-w-0 rounded-xl border-2 p-3 ${selected.includes(family.id) ? 'border-slate-900 dark:border-slate-100' : 'border-slate-200 dark:border-slate-800'}`}>
      <GlobalDesignPreview family={family} brand={brand} variantId={variants[family.id]} />
      <h4 className="mt-3 font-semibold">{family.name}</h4><p className="mt-1 text-xs text-muted-foreground">{family.tags.join(' · ')}</p>
      <select aria-label={`Preview ${family.name} variant`} className="my-3 w-full rounded border bg-background p-2 text-xs" value={variants[family.id] || family.variants[0].id} onChange={e => setVariants(prev => ({ ...prev, [family.id]: e.target.value }))}>{family.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select>
      <Button type="button" disabled={busy} variant={selected.includes(family.id) ? 'default' : 'outline'} className="w-full" aria-pressed={selected.includes(family.id)} onClick={() => toggleFamily(family.id)}>{selected.includes(family.id) && <Check size={14} className="mr-2" />}{selected.includes(family.id) ? 'Selected' : 'Select design'}</Button>
    </article>)}</div>
    {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}{notice && <p role="status" className="mt-4 text-sm text-green-700">{notice}</p>}
    <div className="mt-6 flex items-center justify-between gap-4 border-t pt-5"><p className="text-xs text-muted-foreground">Selection saves automatically after the third design. Existing posts stay editable.</p><Button type="button" onClick={() => save()} disabled={loading || busy || !flowId || selected.length < 3}>{busy && <Loader2 size={14} className="mr-2 animate-spin" />}{busy ? 'Saving…' : 'Save again'}</Button></div>
  </section>
}
