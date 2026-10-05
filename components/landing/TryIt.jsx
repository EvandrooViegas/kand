'use client'
import { useState } from 'react'
import PostCard from './PostCard'
import { cn, reveal } from './brand'

const EXAMPLES = [
  {
    chip: 'Launching a product',
    typed: 'We just launched a bottle that keeps drinks cold all day.',
    caption: 'Meet the bottle that keeps your water cold from the first meeting to the last run. Now available, link in bio.',
    tags: '#newlaunch #hydration #smallbusiness',
    post: { theme: 'butter', label: 'New launch', headline: 'Cold all day. Zero excuses.' },
  },
  {
    chip: 'Announcing a sale',
    typed: 'Our summer sale starts Friday, 30% off everything for the weekend.',
    caption: 'Three days, thirty percent off, zero reasons to wait. The summer sale starts Friday and everything is included.',
    tags: '#summersale #weekenddeals #shopsmall',
    post: { theme: 'coral', label: 'This weekend only', headline: '30% off. All of it.' },
  },
  {
    chip: 'Sharing a tip',
    typed: 'A tip for keeping houseplants alive while you travel.',
    caption: "Going away? Group your plants together and water them deeply the night before. They'll keep each other humid while you're gone.",
    tags: '#planttips #houseplants #plantcare',
    post: { theme: 'lilac', label: 'Quick tip', headline: 'Plants like company too.' },
  },
  {
    chip: 'Posting a quote',
    typed: 'A quote about starting before you feel ready.',
    caption: 'Start messy, fix it later. Most good things began as a rough first draft. Save this one for Monday.',
    tags: '#mondaymotivation #smallsteps #creatorlife',
    post: { theme: 'ink', label: 'Monday note', headline: "Start before you're ready." },
  },
]

function Label({ className = '', children }) {
  return <p className={cn('mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-bk-muted', className)}>{children}</p>
}

export default function TryIt() {
  const [active, setActive] = useState(0)
  const ex = EXAMPLES[active]

  return (
    <>
      <div {...reveal(2)} className="mt-9 flex flex-wrap gap-2" role="group" aria-label="Example ideas">
        {EXAMPLES.map((e, i) => (
          <button
            key={e.chip}
            type="button"
            aria-pressed={active === i}
            onClick={() => setActive(i)}
            className={cn(
              'h-11 rounded-full border px-5 text-[15px] font-bold transition-[background-color,border-color,color,transform] duration-200 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg',
              active === i
                ? 'border-transparent bg-bk-butter text-bk-ink'
                : 'border-bk-field bg-bk-surface text-bk-fg hover:border-bk-fg/60',
            )}
          >
            {e.chip}
          </button>
        ))}
      </div>

      <div
        {...reveal(3)}
        className="mt-9 grid overflow-hidden rounded-2xl border border-bk-line bg-bk-surface shadow-bk-pop lg:grid-cols-2"
        aria-live="polite"
      >
        <div key={`copy-${active}`} className="flex flex-col justify-center p-5 sm:p-9 motion-safe:animate-bk-rise">
          <Label>You type</Label>
          <div className="rounded-lg border border-bk-field px-4 py-3 text-[17px] leading-relaxed">{ex.typed}</div>
          <Label className="mt-6">Batkle writes</Label>
          <p className="text-[17px] leading-[1.6]">{ex.caption}</p>
          <p className="mt-2.5 text-[15px] text-bk-muted">{ex.tags}</p>
        </div>

        <div className="flex items-center justify-center border-t border-bk-line bg-bk-alt p-5 sm:p-9 lg:border-l lg:border-t-0">
          <PostCard
            key={`post-${active}`}
            size="lg"
            theme={ex.post.theme}
            label={ex.post.label}
            headline={ex.post.headline}
            handle="@yourbrand"
            className="w-full max-w-[440px] rounded-[18px] shadow-bk-pop motion-safe:animate-bk-rise"
          />
        </div>
      </div>
    </>
  )
}
