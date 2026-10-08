export default function AppLoading() {
  return (
    <div role="status" aria-label="Loading" className="px-5 pt-8 sm:px-8 lg:px-10 lg:pt-11">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="max-w-[1240px] space-y-5 motion-safe:animate-pulse">
        <div className="h-3 w-40 rounded bg-bk-fg/10" />
        <div className="h-11 w-72 rounded-lg bg-bk-fg/10" />
        <div className="h-36 rounded-2xl bg-bk-surface" />
        <div className="h-64 rounded-[20px] bg-bk-fg/[0.06]" />
      </div>
    </div>
  )
}
