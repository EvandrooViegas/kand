// Shared Batkle landing primitives. No hooks, so these render on the server too.

export function cn(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function Container({ className = '', children }) {
  return <div className={cn('mx-auto w-full max-w-[1264px] px-5 sm:px-8', className)}>{children}</div>
}

export function Section({ id, tone = 'bg', className = '', children }) {
  return (
    <section
      id={id}
      className={cn(
        'scroll-mt-16 border-t border-bk-line py-20 sm:py-28 lg:py-[120px]',
        tone === 'alt' ? 'bg-bk-alt' : 'bg-bk-bg',
        className,
      )}
    >
      <Container>{children}</Container>
    </section>
  )
}

/** Props that fade an element in on scroll (see ScrollReveal). `i` staggers siblings. */
export function reveal(i = 0) {
  return { 'data-reveal': '', style: { '--i': i } }
}

export function Eyebrow({ className = '', children }) {
  return (
    <p {...reveal(0)} className={cn('mb-4 text-[13px] font-bold uppercase tracking-[0.14em] text-bk-muted', className)}>
      {children}
    </p>
  )
}

export const displayClass = 'font-bk-display font-bold tracking-[-0.045em]'

export function SectionTitle({ as: Tag = 'h2', className = '', children }) {
  return (
    <Tag {...reveal(1)} className={cn(displayClass, 'text-[clamp(32px,calc(2.4vw+16px),50px)] leading-[1.04]', className)}>
      {children}
    </Tag>
  )
}

export function CardTitle({ as: Tag = 'h3', className = '', children }) {
  return <Tag className={cn('font-bk-display text-[23px] font-bold leading-tight tracking-[-0.03em]', className)}>{children}</Tag>
}

export const liftClass =
  'transition-[transform,box-shadow] duration-300 ease-out can-hover:-translate-y-1 can-hover:shadow-bk-pop'

/** `i` sets the reveal stagger; `lift` raises the card on hover. */
export function Card({ as: Tag = 'div', i = 0, lift = false, className = '', children }) {
  return (
    <Tag
      {...reveal(i)}
      className={cn('rounded-2xl border border-bk-line bg-bk-surface shadow-bk-card', lift && liftClass, className)}
    >
      {children}
    </Tag>
  )
}

/** Icon tile + wordmark. The tile swaps per theme; the wordmark follows the text colour. */
export function BatkleLogo({ className = '', size = 38 }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <img
        src="/logo/batkle-icon-color.png"
        alt=""
        width={size}
        height={size}
        className="block dark:hidden"
        style={{ width: size, height: size }}
      />
      <img
        src="/logo/batkle-icon-color-reversed.png"
        alt=""
        width={size}
        height={size}
        className="hidden dark:block"
        style={{ width: size, height: size }}
      />
      <span role="img" aria-label="Batkle" className="bk-wordmark text-bk-fg" style={{ height: Math.round(size * 0.64) }} />
    </span>
  )
}

/** The mascot hanging from a line, swinging gently. Size it with font-size, colour it with text colour. */
export function HangingBat({ className = '', stemClassName = '' }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none flex origin-top flex-col items-center motion-safe:animate-bk-swing', className)}
    >
      <span className={cn('block w-[0.13em] bg-current', stemClassName)} />
      <span className="bk-bat -mt-[0.03em]" />
    </div>
  )
}

const buttonBase =
  'group inline-flex items-center justify-center gap-2.5 whitespace-nowrap rounded-lg border font-bold transition-[background-color,border-color,transform] duration-200 active:scale-[0.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg'

/** Arrow icon that nudges forward when its button is hovered. */
export const arrowClass = 'size-[18px] transition-transform duration-200 group-hover:translate-x-1'

const buttonVariants = {
  primary: 'border-transparent bg-bk-butter text-bk-ink hover:bg-[#FFCD24]',
  outline: 'border-bk-field bg-bk-surface text-bk-fg hover:border-bk-fg/60',
}

const buttonSizes = {
  sm: 'h-11 px-5 text-[15px]',
  md: 'h-[50px] px-6 text-base',
  lg: 'h-[54px] px-6 text-[17px]',
}

export function buttonClass(variant = 'primary', size = 'md', className = '') {
  return cn(buttonBase, buttonVariants[variant], buttonSizes[size], className)
}
