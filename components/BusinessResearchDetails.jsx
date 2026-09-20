'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowUpRight, Check, Pencil, Plus, X } from 'lucide-react'

function GrowingTextarea({ value, onChange, label, ...props }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) { ref.current.style.height = 'auto'; ref.current.style.height = `${ref.current.scrollHeight}px` } }, [value])
  return <textarea ref={ref} aria-label={label} value={value} onChange={onChange} rows={2} className="w-full resize-none rounded-lg border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-900 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100" {...props} />
}

function Paragraphs({ text }) {
  const paragraphs = String(text || '').split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean)
  return <div className="space-y-4 text-[14px] leading-7 text-slate-600 dark:text-slate-300">{paragraphs.length ? paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>) : <p className="text-slate-400">Add a few details to help shape future posts.</p>}</div>
}

function Section({ title, subtitle, editing, toggle, children }) {
  return <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 dark:border-slate-800"><div><h3 className="text-base font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h3>{subtitle && <p className="mt-1 text-xs leading-5 text-slate-500">{subtitle}</p>}</div><button type="button" onClick={toggle} aria-label={`${editing ? 'Done editing' : 'Edit'} ${title}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">{editing ? <Check size={13} /> : <Pencil size={12} />}{editing ? 'Done' : 'Edit'}</button></div>
    <div className="p-5 sm:p-6">{children}</div>
  </section>
}

export default function BusinessResearchDetails({ data, onChange, showOverview = false }) {
  const [editing, setEditing] = useState({})
  const [overviewExpanded, setOverviewExpanded] = useState(false)
  const overview = String(data.about || '').split(/\n\s*\n/).filter(Boolean)
  const toggle = key => () => setEditing(previous => ({ ...previous, [key]: !previous[key] }))
  const projects = Array.isArray(data.projects) ? data.projects : []
  const list = key => Array.isArray(data[key]) ? data[key] : String(data[key] || '').split('\n').filter(Boolean)
  const editList = key => <div className="space-y-3">{list(key).map((item, index) => <div key={index} className="flex items-start gap-2"><GrowingTextarea label={`${key} ${index + 1}`} value={item} onChange={e => onChange(key, list(key).map((value, i) => i === index ? e.target.value : value))} /><button type="button" aria-label={`Remove ${key} ${index + 1}`} onClick={() => onChange(key, list(key).filter((_, i) => i !== index))} className="mt-3 rounded p-1 text-slate-400 hover:text-red-600"><X size={15} /></button></div>)}<button type="button" onClick={() => onChange(key, [...list(key), ''])} className="inline-flex items-center gap-1.5 text-xs font-medium"><Plus size={14} />Add item</button></div>
  const plainList = key => <ul className="divide-y divide-slate-100 dark:divide-slate-800">{list(key).map((item, index) => <li key={index} className="flex gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 text-[11px] font-medium tabular-nums text-slate-400">{String(index + 1).padStart(2, '0')}</span><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{item}</p></li>)}{!list(key).length && <li className="text-sm text-slate-400">Nothing added yet. Select Edit to add details.</li>}</ul>
  return <div className="space-y-5">
    {showOverview && <Section title="Business overview" subtitle="The story, expertise and context behind your brand." editing={editing.about} toggle={toggle('about')}>{editing.about ? <div className="space-y-4"><label className="block text-xs font-medium text-slate-500">Business name<input aria-label="Business name" className="mt-2 block w-full rounded-lg border bg-transparent p-3 text-sm text-foreground" value={data.name || ''} onChange={e => onChange('name', e.target.value)} /></label><GrowingTextarea label="Business overview" value={data.about || ''} onChange={e => onChange('about', e.target.value)} /></div> : <><Paragraphs text={overviewExpanded ? data.about : overview[0]} />{overview.length > 1 && <button type="button" onClick={() => setOverviewExpanded(value => !value)} aria-expanded={overviewExpanded} className="mt-4 text-xs font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 dark:text-slate-300">{overviewExpanded ? 'Show less' : 'Read full overview'}</button>}</>}</Section>}
    <Section title="Services & products" subtitle="What you offer and the value it brings to your customers." editing={editing.services} toggle={toggle('services')}>
      {editing.services ? editList('services') : <div className="divide-y divide-slate-100 dark:divide-slate-800">{list('services').map((item, index) => {
        const match = item.match(/^(.{3,100}?)\s+[—–]\s+([\s\S]+)$/)
        return <div key={index} className="grid gap-2 py-5 first:pt-0 last:pb-0 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-8"><h4 className="text-sm font-semibold leading-6 text-slate-900 dark:text-slate-100">{match ? match[1] : `Service ${String(index + 1).padStart(2, '0')}`}</h4><p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{match ? match[2] : item}</p></div>
      })}{!list('services').length && <p className="text-sm text-slate-400">Add your services to make future posts more specific.</p>}</div>}
    </Section>
    <div className="grid items-start gap-5 lg:grid-cols-2">{[['targetAudience', 'Ideal customers', 'Who you serve and what they need.'], ['tone', 'Voice & tone', 'How your brand should sound.']].map(([key, title, subtitle]) => <Section key={key} title={title} subtitle={subtitle} editing={editing[key]} toggle={toggle(key)}>{editing[key] ? <GrowingTextarea label={title} value={data[key] || ''} onChange={e => onChange(key, e.target.value)} /> : <Paragraphs text={data[key]} />}</Section>)}</div>
    <Section title="What sets you apart" subtitle="Specific strengths to bring into your content." editing={editing.differentiators} toggle={toggle('differentiators')}>{editing.differentiators ? editList('differentiators') : plainList('differentiators')}</Section>
    <div className="grid items-start gap-5 lg:grid-cols-2">{[['suggestedCtas', 'Calls to action', 'Clear next steps for your audience.'], ['contentTopics', 'Content opportunities', 'Post ideas grounded in your business.']].map(([key, title, subtitle]) => <Section key={key} title={title} subtitle={subtitle} editing={editing[key]} toggle={toggle(key)}>{editing[key] ? editList(key) : plainList(key)}</Section>)}</div>
    {projects.length > 0 && <Section title="Projects & work" subtitle="Real examples to support your content." editing={editing.projects} toggle={toggle('projects')}><div className="grid gap-6 md:grid-cols-2">{projects.map((project, index) => <article key={index} className="space-y-3 border-l-2 border-slate-200 pl-4 dark:border-slate-700">{editing.projects ? <><GrowingTextarea label={`Project ${index + 1} name`} value={project.name} onChange={e => onChange('projects', projects.map((p, i) => i === index ? { ...p, name: e.target.value } : p))} /><GrowingTextarea label={`Project ${index + 1} description`} value={project.description} onChange={e => onChange('projects', projects.map((p, i) => i === index ? { ...p, description: e.target.value } : p))} /></> : <><h4 className="text-sm font-semibold leading-6">{project.name}</h4><Paragraphs text={project.description} /></>}{project.sourceUrl && <a href={project.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white">View project<ArrowUpRight size={12} /></a>}</article>)}</div></Section>}
    {data.researchSources?.length > 0 && <details className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900"><summary className="cursor-pointer text-xs font-medium text-slate-500">Sources · {data.researchSources.length} website pages</summary><div className="mt-4 space-y-3">{data.researchSources.map(page => <a key={page.url} href={page.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-3 break-all text-xs text-slate-600 dark:text-slate-300">{page.url}<ArrowUpRight size={13} className="shrink-0" /></a>)}</div></details>}
    {data.researchWarnings?.map(item => <p key={item.url} className="text-xs text-amber-700">{item.message} {item.url}</p>)}
  </div>
}
