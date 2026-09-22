export default function FlowLoading() {
  return (
    <div role="status" aria-label="Loading flow page" className="w-full space-y-6 p-4 sm:p-6">
      <span className="sr-only">Loading flow page…</span>
      <div aria-hidden="true" className="animate-pulse space-y-6">
        <div className="h-8 w-56 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="h-24 rounded-xl bg-slate-100 dark:bg-slate-900" />
        <div className="h-10 w-3/4 rounded bg-slate-100 dark:bg-slate-900" />
        <div className="h-64 rounded-xl bg-slate-100 dark:bg-slate-900" />
      </div>
    </div>
  )
}
