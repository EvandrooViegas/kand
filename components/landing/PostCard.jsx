import { cn, displayClass } from './brand'

// Post previews keep fixed colours in both themes: they are content, not chrome.
const themes = {
  butter: { card: 'bg-bk-butter', label: 'text-bk-ink/85', headline: 'text-bk-ink', handle: 'text-bk-ink' },
  ink: { card: 'bg-bk-ink ring-1 ring-inset ring-white/10', label: 'text-bk-butter', headline: 'text-bk-cream', handle: 'text-bk-cream/80' },
  cream: { card: 'bg-bk-cream ring-1 ring-inset ring-bk-ink/10', label: 'text-bk-ink/70', headline: 'text-bk-ink', handle: 'text-bk-ink' },
  coral: { card: 'bg-bk-coral', label: 'text-bk-ink/80', headline: 'text-bk-ink', handle: 'text-bk-ink' },
  lilac: { card: 'bg-bk-lilac', label: 'text-bk-ink/75', headline: 'text-bk-ink', handle: 'text-bk-ink' },
}

const sizes = {
  sm: {
    label: 'text-[clamp(10px,4.4cqw,12px)] tracking-[0.12em]',
    headline: 'text-[clamp(24px,14cqw,40px)]',
    handle: 'text-[clamp(11px,4.8cqw,13px)]',
  },
  lg: {
    label: 'text-[clamp(11px,3cqw,14px)] tracking-[0.14em]',
    headline: 'text-[12.8cqw]',
    handle: 'text-[clamp(13px,3.4cqw,16px)]',
  },
}

export default function PostCard({ theme = 'butter', size = 'sm', label, headline, handle, className = '', style }) {
  const t = themes[theme] || themes.butter
  const s = sizes[size]
  return (
    <div className={cn('relative aspect-square overflow-hidden [container-type:inline-size]', t.card, className)} style={style}>
      <div className="absolute inset-0 flex flex-col justify-between p-[8.5cqw]">
        <p className={cn('font-bold uppercase', s.label, t.label)}>{label}</p>
        <p className={cn(displayClass, 'leading-[1.02]', s.headline, t.headline)}>{headline}</p>
        <p className={cn('font-bold', s.handle, t.handle)}>{handle}</p>
      </div>
    </div>
  )
}
