'use client'
import { useState } from 'react'
import { cn, displayClass, reveal } from './brand'

// Sample brands for illustration. Posts keep their brand colours in both themes: they are content, not chrome.
const DEMO_BRANDS = [
  {
    tab: 'Construction firm',
    name: 'Ferreira Construções',
    domain: 'ferreiraconstrucoes.pt',
    lang: 'pt-PT',
    language: 'European Portuguese',
    tone: 'Direct, trustworthy',
    fonts: 'Barlow Condensed, Barlow',
    colors: ['#F2A900', '#1E1D24', '#F5F1E8'],
    caption: 'Reabilitar é dar nova vida ao que já existe. Conheça o nosso processo, da vistoria à entrega das chaves.',
    tags: '#reabilitacao #construcao #lisboa',
    post: { bg: '#F2A900', fg: '#14131A', label: 'Reabilitação · Lisboa', headline: 'Cada obra começa com uma boa base.', page: '1 / 5' },
  },
  {
    tab: 'Fintech',
    name: 'Nordpay',
    domain: 'nordpay.co.uk',
    lang: 'en-GB',
    language: 'British English',
    tone: 'Clear, reassuring',
    fonts: 'Manrope, Inter',
    colors: ['#3B5BFF', '#0E1433', '#EEF1FF'],
    caption: "Month-end shouldn't eat your week. Approve every invoice in one place and Nordpay pays each supplier on time.",
    tags: '#smallbusiness #payments #fintech',
    post: { bg: '#3B5BFF', fg: '#FFFFFF', label: 'Supplier payments', headline: 'Pay every supplier in one click.', page: '1 / 4' },
  },
  {
    tab: 'Local services',
    name: 'Casa Limpa',
    domain: 'casalimpa.pt',
    lang: 'pt-PT',
    language: 'European Portuguese',
    tone: 'Warm, friendly',
    fonts: 'Nunito, Nunito Sans',
    colors: ['#1F7A5A', '#F5F1E8', '#FFD84D'],
    caption: 'Chegue a casa e encontre tudo no sítio. Marque a sua limpeza semanal em dois minutos.',
    tags: '#limpezas #porto #casalimpa',
    post: { bg: '#1F7A5A', fg: '#F5F1E8', label: 'Limpezas · Porto', headline: 'Casa limpa, cabeça leve.', page: '1 / 3' },
  },
  {
    tab: 'Creative studio',
    name: 'Estudio Sal',
    domain: 'estudiosal.es',
    lang: 'es',
    language: 'Spanish',
    tone: 'Playful, confident',
    fonts: 'Fraunces, Work Sans',
    colors: ['#E4572E', '#14131A', '#FBEDE4'],
    caption: 'Una marca clara lo hace todo más fácil. Así construimos la identidad de cada cliente, paso a paso.',
    tags: '#branding #diseño #valencia',
    post: { bg: '#E4572E', fg: '#14131A', label: 'Branding · Valencia', headline: 'Las buenas marcas se notan.', page: '1 / 6' },
  },
]

function Label({ className = '', children }) {
  return <p className={cn('text-[12px] font-bold uppercase tracking-[0.14em] text-bk-muted', className)}>{children}</p>
}

function ProfileRow({ label, children }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bk-line py-3 text-[15px]">
      <dt className="text-bk-muted">{label}</dt>
      <dd className="text-right font-bold">{children}</dd>
    </div>
  )
}

/** A 4:5 post (1080×1350) that scales with its width. */
function Post({ brand }) {
  const { post } = brand
  return (
    <div
      lang={brand.lang}
      className="relative aspect-[4/5] w-full max-w-[380px] overflow-hidden rounded-xl shadow-bk-pop [container-type:inline-size] motion-safe:animate-bk-rise"
      style={{ backgroundColor: post.bg, color: post.fg }}
    >
      <div className="absolute inset-0 flex flex-col p-[9cqw]">
        <p className="text-[clamp(10px,3.4cqw,13px)] font-bold uppercase tracking-[0.08em]">{post.label}</p>
        <p className={cn(displayClass, 'my-auto text-[12.2cqw] leading-none')}>{post.headline}</p>
        <div className="flex items-baseline justify-between gap-3 text-[clamp(10px,3.4cqw,13px)] font-bold">
          <span>{brand.name}</span>
          <span>{post.page}</span>
        </div>
      </div>
    </div>
  )
}

export default function BrandDemo() {
  const [active, setActive] = useState(0)
  const brand = DEMO_BRANDS[active]

  return (
    <>
      <div {...reveal(3)} className="mt-9 flex flex-wrap gap-2" role="group" aria-label="Type of business">
        {DEMO_BRANDS.map((b, i) => (
          <button
            key={b.tab}
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
            {b.tab}
          </button>
        ))}
      </div>

      <div
        {...reveal(4)}
        className="mt-9 grid overflow-hidden rounded-2xl border border-bk-line bg-bk-surface shadow-bk-card lg:grid-cols-2"
        aria-live="polite"
      >
        <div key={`profile-${active}`} className="flex flex-col justify-center p-6 sm:p-9 motion-safe:animate-bk-rise">
          <Label>Brand profile</Label>
          <h3 className="mt-1.5 font-bk-display text-[28px] font-bold leading-tight tracking-[-0.03em]">{brand.name}</h3>
          <p className="mt-1 text-[15px] text-bk-muted">{brand.domain}</p>

          <dl className="mt-4">
            <ProfileRow label="Language">{brand.language}</ProfileRow>
            <ProfileRow label="Tone">{brand.tone}</ProfileRow>
            <ProfileRow label="Fonts">{brand.fonts}</ProfileRow>
            <ProfileRow label="Colors">
              <span className="flex gap-1.5">
                {brand.colors.map((color) => (
                  <span
                    key={color}
                    title={color}
                    className="size-7 rounded-full ring-1 ring-inset ring-bk-ink/15"
                    style={{ backgroundColor: color }}
                  />
                ))}
              </span>
            </ProfileRow>
          </dl>

          <Label className="mt-6">Caption</Label>
          <p lang={brand.lang} className="mt-2.5 text-[16px] leading-[1.55]">
            {brand.caption}
          </p>
          <p className="mt-2.5 text-[14px] text-bk-muted">{brand.tags}</p>
        </div>

        <div className="flex items-center justify-center border-t border-bk-line bg-bk-alt p-6 sm:p-9 lg:border-l lg:border-t-0">
          <Post key={`post-${active}`} brand={brand} />
        </div>
      </div>
    </>
  )
}
