'use client'

import { studyReportSections } from '@/lib/designs/global/study'

function DNASections({ dna }) {
  return <div className="space-y-6">{studyReportSections(dna).map(section => <section key={section.title}>
    <h3 className="mb-2 font-semibold">{section.title}</h3>
    {section.ordered ? <ol className="list-decimal space-y-2 pl-5">{section.items.map((item, i) => <li key={i}>{item.replace(/^\d+[.)]\s*/, '')}</li>)}</ol> : <ul className="list-disc space-y-2 pl-5">{section.items.map((item, i) => <li key={i}>{item}</li>)}</ul>}
  </section>)}</div>
}

export default function DesignStudyReport({ study }) {
  const referenceLabel = id => {
    const index = study.referenceImages.findIndex(ref => ref.id === id)
    return `Reference ${index + 1}`
  }
  return <article className="space-y-7 break-words text-sm leading-7 text-slate-900 dark:text-slate-100">
    <header><h2 className="text-xl font-semibold">Design Study</h2><p className="mt-1 text-base">{study.name}</p></header>
    <div className="flex flex-wrap gap-4">{study.referenceImages.map((ref, i) => <a key={ref.id} href={ref.url} target="_blank" rel="noreferrer" className="w-36"><img src={ref.url} alt={`Reference ${i + 1}: ${ref.name}`} className="h-44 w-full rounded border bg-slate-100 object-contain" /><span>Reference {i + 1}</span></a>)}</div>
    <DNASections dna={study.designDNA} />
    <section><h3 className="mb-2 font-semibold">Shared Family Characteristics</h3>{study.sharedCharacteristics.length ? <ul className="list-disc space-y-2 pl-5">{study.sharedCharacteristics.map((claim, i) => <li key={i}>{claim.characteristic}<span className="block text-xs text-slate-600 dark:text-slate-300">Observed across {claim.referenceIds.map(referenceLabel).join(', ')}</span></li>)}</ul> : <p>No consistent family characteristics were established across all references.</p>}</section>
    <section><h3 className="mb-2 font-semibold">Reference Differences</h3><ul className="list-disc space-y-2 pl-5">{study.differences.map((item, i) => <li key={i}>{item}</li>)}</ul></section>
    {study.referenceStudies.map(ref => <section key={ref.referenceId} className="rounded-lg border p-4">
      <h3 className="mb-2 font-semibold">{referenceLabel(ref.referenceId)} Characteristics</h3>
      <ul className="list-disc space-y-2 pl-5">{ref.dna.distinctiveCharacteristics.map((item, i) => <li key={i}>{item}</li>)}</ul>
      <details className="mt-4"><summary className="cursor-pointer font-medium">Individual analysis and visual evidence</summary><div className="mt-4"><DNASections dna={ref.dna} /><h4 className="mb-2 mt-6 font-semibold">Visual evidence</h4><ul className="space-y-3">{ref.evidence.map((item, i) => <li key={i}><strong>{item.principle}</strong><p>{item.observation}</p></li>)}</ul></div></details>
    </section>)}
    <details><summary className="cursor-pointer font-medium">Structured Design DNA</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-slate-100 p-4 text-xs dark:bg-slate-900">{JSON.stringify(study, null, 2)}</pre></details>
  </article>
}
