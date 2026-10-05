'use client'
import { useState } from 'react'
import PostCard from './PostCard'
import { cn } from './brand'

const TONES = [
  {
    name: 'Playful',
    headline: 'Oat latte season is here.',
    caption: 'Sweater weather called, and our oat latte answered. Come warm up this week.',
    tags: '#oatlatte #fallvibes #coffeeshop',
  },
  {
    name: 'Warm',
    headline: 'Made for slow mornings.',
    caption: 'Our new oat latte is here, made for slow mornings and long chats. Come say hi this week.',
    tags: '#oatlatte #cozyseason #shoplocal',
  },
  {
    name: 'Direct',
    headline: 'New: the oat latte.',
    caption: 'The oat latte is officially on the menu. Available every day this week.',
    tags: '#oatlatte #newonthemenu #coffeeshop',
  },
]

const SWATCHES = [
  { theme: 'butter', name: 'Butter', className: 'bg-bk-butter' },
  { theme: 'ink', name: 'Ink', className: 'bg-bk-ink dark:ring-1 dark:ring-inset dark:ring-white/15' },
  { theme: 'cream', name: 'Cream', className: 'bg-bk-cream ring-1 ring-inset ring-bk-ink/15' },
]

function Label({ className = '', children }) {
  return <p className={cn('text-[12px] font-bold uppercase tracking-[0.14em] text-bk-muted', className)}>{children}</p>
}

export default function HeroDemo() {
  const [toneIndex, setToneIndex] = useState(0)
  const [theme, setTheme] = useState('butter')
  const tone = TONES[toneIndex]
  const nextTone = TONES[(toneIndex + 1) % TONES.length]

  return (
    <div
      role="group"
      aria-label="Batkle demo: one idea becomes a finished post"
      className="overflow-hidden rounded-2xl border border-bk-line bg-bk-surface text-bk-fg shadow-bk-pop"
    >
      <div className="flex items-center justify-between gap-4 border-b border-bk-line bg-bk-alt px-4 py-3 sm:px-5">
        <div className="flex items-center gap-2.5">
          <img src="/logo/batkle-icon-color-reversed.png" alt="" width={22} height={22} className="size-[22px]" />
          <span className="text-[14px] font-bold">New post</span>
        </div>
        <span className="text-[13px] text-bk-muted">Square · 1:1</span>
      </div>

      <div className="p-4 sm:p-6">
        <Label className="mb-2">Your idea</Label>
        <div className="flex min-h-[50px] items-center rounded-lg border border-bk-field px-3.5 py-2.5 text-[16px] leading-snug">
          <span>
            Announce our new oat latte. Cozy, a little funny.
            <span
              aria-hidden="true"
              className="ml-0.5 inline-block h-[1.05em] w-[1.5px] translate-y-[0.18em] bg-bk-fg motion-safe:animate-bk-blink"
            />
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-[15px] text-bk-muted">
          <span className="flex items-center gap-2">
            Tone
            <button
              type="button"
              onClick={() => setToneIndex((i) => (i + 1) % TONES.length)}
              aria-label={`Tone: ${tone.name}. Switch to ${nextTone.name}`}
              title="Switch tone"
              className="rounded-full bg-bk-butter px-3 py-1 text-[14px] font-bold text-bk-ink transition-colors hover:bg-[#FFCD24] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg"
            >
              {tone.name}
            </button>
          </span>
          <span className="flex items-center gap-2">
            Brand
            <span className="flex gap-1.5" aria-hidden="true">
              <span className="size-[18px] rounded-full bg-bk-butter" />
              <span className="size-[18px] rounded-full bg-bk-ink dark:ring-1 dark:ring-white/20" />
              <span className="size-[18px] rounded-full bg-bk-cream ring-1 ring-inset ring-bk-ink/20" />
            </span>
          </span>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <PostCard
            key={tone.name}
            theme={theme}
            label="New on the menu"
            headline={tone.headline}
            handle="@yourcafe"
            className="rounded-[14px] transition-colors duration-300 motion-safe:animate-bk-rise"
          />
          <div className="flex flex-col" aria-live="polite">
            <Label className="mb-2 mt-1">Caption</Label>
            <p className="text-[15px] leading-relaxed">{tone.caption}</p>
            <p className="mt-2 text-[14px] text-bk-muted">{tone.tags}</p>
            <div className="mt-5 flex gap-2.5 sm:mt-auto" role="group" aria-label="Post color">
              {SWATCHES.map((s) => (
                <button
                  key={s.theme}
                  type="button"
                  aria-label={s.name}
                  aria-pressed={theme === s.theme}
                  onClick={() => setTheme(s.theme)}
                  className={cn(
                    'size-12 rounded-lg transition-[box-shadow,transform] duration-200 active:scale-95 can-hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg',
                    s.className,
                    theme === s.theme && 'shadow-[0_0_0_2px_rgb(var(--bk-fg))]',
                  )}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
