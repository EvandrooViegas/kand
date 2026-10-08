import { cn } from '@/lib/utils'

/** Batkle text field: used in popups and onboarding so inputs match the app's buttons. */
export function appField(className = '') {
  return cn(
    'h-11 w-full min-w-0 rounded-lg border border-bk-field bg-bk-surface px-3.5 text-[15px] text-bk-fg outline-none transition-[border-color,box-shadow] placeholder:text-bk-muted/80',
    'focus:border-bk-fg focus:shadow-[0_0_0_4px_rgb(255_216_77/0.45)] disabled:opacity-60 aria-[invalid=true]:border-[#C2412F]',
    className,
  )
}
