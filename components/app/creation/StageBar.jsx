import { cn } from '@/lib/utils'

const LABELS = {
  content: 'Content and design plan',
  visuals: 'Visuals',
  build: { dark: 'Building and checking', light: 'Build and check' },
}
const SPOKEN = { done: 'done', active: 'in progress', pending: 'not started', error: 'failed', skipped: 'not needed' }

/** The three real build stages. `tone="dark"` is for the featured card, `light` for list rows. */
export function StageBar({ steps, tone = 'light', className = '' }) {
  const dark = tone === 'dark'
  return (
    <ol className={cn('grid grid-cols-3 gap-1.5', dark ? 'max-w-[420px]' : 'max-w-[400px]', className)} aria-label="Post progress">
      {steps.map(step => {
        const label = step.key === 'build' ? LABELS.build[tone] : step.key === 'visuals' && step.state === 'skipped' ? 'No images needed' : LABELS[step.key]
        return (
          <li key={step.key} className="min-w-0">
            <span className={cn('relative block overflow-hidden rounded-full', dark ? 'h-1 bg-[#3A3748]' : 'h-[3px] bg-bk-field')}>
              {step.state === 'active' ? (
                <span className={cn('absolute inset-y-0 left-0 w-1/2 rounded-full motion-safe:w-2/5 motion-safe:animate-bk-indeterminate', dark ? 'bg-bk-butter' : 'bg-bk-fg')} />
              ) : step.state !== 'pending' && (
                <span className={cn('absolute inset-0 rounded-full', step.state === 'error' ? 'bg-[#D9534F]' : dark ? 'bg-bk-butter' : 'bg-bk-fg', step.state === 'skipped' && 'opacity-40')} />
              )}
            </span>
            <span
              className={cn(
                'mt-1.5 block text-[11.5px] leading-snug',
                step.state === 'error' ? 'font-bold text-[#D9534F]'
                  : step.state === 'active' ? cn('font-bold', dark ? 'text-bk-cream' : 'text-bk-fg')
                  : dark ? 'text-bk-cream/65' : 'text-bk-fg/75',
              )}
            >
              {label}
              <span className="sr-only">: {SPOKEN[step.state]}</span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
