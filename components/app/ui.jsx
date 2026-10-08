import { cn } from '@/lib/utils'
import { batkleFonts } from '@/lib/batkleFonts'

/** Cookie holding the sidebar state; read by the server layout so a collapsed sidebar never flashes open. */
export const SIDEBAR_COOKIE = 'bk_sidebar'

/**
 * Classes for a Batkle app root. Dialogs, menus and sheets render in a portal outside the page,
 * so they need these too to keep the app's colours and fonts.
 */
export const appLayer = cn('bk-root bk-app font-bk-body text-bk-fg antialiased', batkleFonts)

const buttonBase =
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-lg font-bold transition-[background-color,border-color,color,opacity,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg'

const buttonVariants = {
  primary: 'bg-bk-butter text-bk-ink hover:bg-[#FFCD24]',
  outline: 'border border-bk-field bg-bk-surface text-bk-fg hover:border-bk-fg/50',
  ink: 'bg-bk-fg text-bk-bg hover:opacity-90',
  onDark: 'border border-white/25 text-bk-cream hover:border-white/60 focus-visible:outline-bk-cream',
  quiet: 'text-bk-fg hover:bg-bk-alt',
}

// Compact app density: comfortable on a 13" laptop, still at least 32 px tall for touch.
const buttonSizes = {
  xs: 'h-8 px-2.5 text-[12.5px]',
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-4 text-[13.5px]',
}

export function appButton(variant = 'outline', size = 'md', className = '') {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
}

export function Eyebrow({ className = '', children }) {
  return <p className={cn('text-[11px] font-bold uppercase tracking-[0.14em] text-bk-muted', className)}>{children}</p>
}

export const displayClass = 'font-bk-display font-bold tracking-[-0.04em]'

/**
 * The logo to show for a brand and whether it needs a dark tile. A white or very light logo
 * (measured when its variants were made) would vanish on white, so it sits on ink instead.
 */
export function brandLogo(brandContext) {
  const variants = brandContext?.logoVariants
  return { src: variants?.originalTransparent || brandContext?.logo || null, onDark: (variants?.inkLightness ?? 0) > 0.72 }
}

/** Brand logo tile: the logo on white (or ink, for light logos), or the brand's initial on butter. */
export function BrandTile({ name, logo, logoOnDark = false, size = 36, className = '' }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?'
  return logo ? (
    <span
      className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-lg border p-1', logoOnDark ? 'border-transparent bg-bk-ink' : 'border-bk-line bg-white', className)}
      style={{ width: size, height: size }}
    >
      <img src={logo} alt="" className="max-h-full max-w-full object-contain" />
    </span>
  ) : (
    <span
      aria-hidden="true"
      className={cn('flex shrink-0 items-center justify-center rounded-lg bg-bk-butter font-bk-display font-bold text-bk-ink', className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.45) }}
    >
      {initial}
    </span>
  )
}
