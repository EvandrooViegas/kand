import Link from 'next/link'
import { ArrowRight, Check, Plus, X } from 'lucide-react'
import LandingHeader from './LandingHeader'
import HeroDemo from './HeroDemo'
import TryIt from './TryIt'
import CustomCursor from './CustomCursor'
import ScrollReveal from './ScrollReveal'
import {
  BatkleLogo,
  Card,
  CardTitle,
  Container,
  Eyebrow,
  HangingBat,
  Section,
  SectionTitle,
  arrowClass,
  buttonClass,
  cn,
  displayClass,
  liftClass,
  reveal,
} from './brand'

const START_HREF = '/flow'

const STEPS = [
  {
    title: 'Describe your idea',
    body: 'Type a sentence about what you want to share: a launch, an offer, a tip. Rough notes are fine.',
  },
  {
    title: 'Review the AI drafts',
    body: 'Batkle designs the layout and writes the caption and hashtags to match your brand. Compare options side by side.',
  },
  {
    title: 'Adjust and publish',
    body: 'Edit any word or color until it feels right, then take it to your feed.',
  },
]

const AUDIENCES = [
  {
    title: 'Creators',
    body: 'Keep your feed active without living inside it, and spend the time on the content only you can make.',
    cta: 'Start as a creator',
  },
  {
    title: 'Small brands',
    body: 'No designer or agency needed. Look consistent and professional from your very first post.',
    cta: 'Start as a brand',
  },
  {
    title: 'Social teams',
    body: 'Turn a pile of ideas into a full calendar of on-brand drafts, ready for review.',
    cta: 'Start as a team',
  },
]

const WITHOUT = ['Start from a blank canvas', 'Juggle several apps for one post', 'Rewrite the caption again and again', 'Skip a day, then skip a week']
const WITH = ['Type one sentence', 'Pick the draft you like best', 'Tweak a word or two', 'Post it and get on with your day']

// Placeholders from the design: replace with real customer quotes and plans before launch.
const QUOTES = [
  '[CUSTOMER QUOTE: one or two sentences about how Batkle changed their posting routine.]',
  '[CUSTOMER QUOTE: a second quote, ideally about speed or staying on brand.]',
]
const PLANS = [{ popular: false }, { popular: true }, { popular: false }]

const FAQS = [
  {
    q: 'Do I need design skills?',
    a: 'No. Type one sentence about what you want to share and Batkle handles the layout, the caption and the hashtags.',
  },
  {
    q: 'Can I change what the AI creates?',
    a: 'Always. Edit any line, color or headline before you post. The AI drafts, you decide.',
  },
  {
    q: 'Will my posts look like my brand?',
    a: 'Yes. Set your colors and fonts once, and every post comes out looking like it belongs to the same brand.',
  },
  {
    q: 'How long does a post take?',
    a: 'About as long as it takes to type your idea. Your first post takes shape in minutes.',
  },
  {
    q: 'Can I use it for a whole team?',
    a: 'Yes. Social teams can turn a pile of ideas into a full calendar of on-brand drafts, ready for review.',
  },
  {
    q: 'How much does it cost?',
    a: '[ADD YOUR PRICING ANSWER.] See the plans above for what each one includes.',
  },
]

const FOOTER_LINKS = [
  {
    title: 'Product',
    links: [
      ['How it works', '#how-it-works'],
      ['Features', '#features'],
      ['Pricing', '#pricing'],
      ['FAQ', '#faq'],
      ['Flow', '/flow'],
    ],
  },
  {
    title: 'Company',
    links: [
      ['Contact', '#'],
      ['Privacy', '#'],
      ['Terms', '#'],
    ],
  },
]

function Hero() {
  return (
    <section className="bg-bk-bg">
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,578px)] lg:gap-16 lg:py-[96px]">
        <div>
          <p className="mb-6 inline-flex items-center gap-2.5 text-[14px] font-bold text-bk-fg/80 motion-safe:animate-bk-enter">
            <span aria-hidden="true" className="size-2.5 rounded-full bg-bk-butter ring-[3px] ring-bk-line" />
            AI Instagram post maker
          </p>
          <h1
            className={cn(displayClass, 'max-w-[620px] text-[clamp(38px,5vw,70px)] leading-[0.99] motion-safe:animate-bk-enter')}
            style={{ animationDelay: '70ms' }}
          >
            Turn a single idea into a finished Instagram post.
          </h1>
          <p
            className="mt-6 max-w-[500px] text-[18px] leading-[1.6] text-bk-muted motion-safe:animate-bk-enter sm:text-[20px]"
            style={{ animationDelay: '140ms' }}
          >
            Batkle designs the post, writes the caption and suggests the hashtags, all in your brand&apos;s colors and
            voice. You review, adjust and publish.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 motion-safe:animate-bk-enter" style={{ animationDelay: '210ms' }}>
            <Link href={START_HREF} className={buttonClass('primary', 'lg')}>
              Create your first post <ArrowRight className={arrowClass} aria-hidden="true" />
            </Link>
            <a href="#live-demo" className={buttonClass('outline', 'lg')}>
              See it in action
            </a>
          </div>
          <ul
            className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[15px] text-bk-muted motion-safe:animate-bk-enter"
            style={{ animationDelay: '280ms' }}
          >
            {['Designs', 'Captions', 'Hashtags', 'Alt text'].map((item) => (
              <li key={item} className="flex items-center gap-2">
                <Check className="size-4" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="motion-safe:animate-bk-enter" style={{ animationDelay: '180ms' }}>
          <HeroDemo />
        </div>
      </Container>
    </section>
  )
}

function HowItWorks() {
  return (
    <Section id="how-it-works" tone="alt">
      <Eyebrow>How it works</Eyebrow>
      <SectionTitle className="max-w-[9.6em]">Three steps from idea to published post.</SectionTitle>
      <ol className="mt-12 grid gap-10 sm:mt-14 md:grid-cols-3 md:gap-8">
        {STEPS.map((step, i) => (
          <li key={step.title} {...reveal(i + 2)} className="border-t-2 border-bk-fg pt-7">
            <p className="text-[14px] font-bold text-bk-muted">{String(i + 1).padStart(2, '0')}</p>
            <CardTitle className="mt-3">{step.title}</CardTitle>
            <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">{step.body}</p>
          </li>
        ))}
      </ol>
    </Section>
  )
}

function LiveDemo() {
  return (
    <Section id="live-demo">
      <Eyebrow>Live demo</Eyebrow>
      <SectionTitle className="max-w-[9.6em]">Pick an idea and see what Batkle makes.</SectionTitle>
      <TryIt />
    </Section>
  )
}

function Features() {
  const days = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return (
    <Section id="features" tone="alt">
      <Eyebrow>Features</Eyebrow>
      <SectionTitle>
        Everything a good post <br className="hidden sm:inline" />
        needs, without the busywork.
      </SectionTitle>

      <div className="mt-12 grid gap-5 sm:mt-14 lg:grid-cols-[minmax(0,1.59fr)_minmax(0,1fr)]">
        <Card i={2} lift className="flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div className="max-w-[400px]">
            <CardTitle>On brand, every time</CardTitle>
            <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">
              Set your colors and fonts once. Every post comes out looking like it belongs to the same brand.
            </p>
          </div>
          <div className="shrink-0" aria-hidden="true">
            <div className="flex gap-2">
              <span className="size-[46px] rounded-lg bg-bk-butter" />
              <span className="size-[46px] rounded-lg bg-bk-ink dark:ring-1 dark:ring-inset dark:ring-white/15" />
              <span className="size-[46px] rounded-lg bg-bk-cream ring-1 ring-inset ring-bk-ink/15" />
              <span className="size-[46px] rounded-lg bg-bk-lilac ring-1 ring-inset ring-bk-ink/10" />
            </div>
            <p className="mt-3 flex items-baseline gap-3">
              <span className="font-bk-display text-[40px] font-bold tracking-[-0.03em]">Aa</span>
              <span className="text-[30px]">Aa</span>
            </p>
          </div>
        </Card>

        <Card i={3} lift className="p-6 sm:p-8">
          <CardTitle>Captions in your voice</CardTitle>
          <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">Pick a tone and Batkle writes the way you would.</p>
          <div className="mt-5 flex flex-wrap gap-1.5" aria-hidden="true">
            <span className="rounded-full border border-transparent bg-bk-butter px-3 py-1 text-[14px] font-bold text-bk-ink">Playful</span>
            <span className="rounded-full border border-bk-field px-3 py-1 text-[14px]">Warm</span>
            <span className="rounded-full border border-bk-field px-3 py-1 text-[14px]">Direct</span>
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 md:grid-cols-3">
        <Card i={0} lift className="p-6 sm:p-8">
          <CardTitle>Hashtags, sorted</CardTitle>
          <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">Relevant tags drafted with every post.</p>
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Example hashtags">
            {['#oatlatte', '#fallvibes', '#coffeeshop', '#shoplocal'].map((tag) => (
              <li key={tag} className="rounded-md bg-bk-chip px-2.5 py-1 text-[15px]">
                {tag}
              </li>
            ))}
          </ul>
        </Card>

        <Card i={1} lift className="p-6 sm:p-8">
          <CardTitle>You get the last word</CardTitle>
          <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">Edit any line, color or headline. The AI drafts, you decide.</p>
          <p className="mt-5 rounded-lg border border-bk-field px-4 py-3 font-bk-display text-[19px] font-bold leading-snug tracking-[-0.02em]">
            Oat latte season is{' '}
            <mark className="rounded-[4px] bg-bk-butter px-1 text-bk-ink">finally</mark> here.
          </p>
        </Card>

        <Card i={2} lift className="p-6 sm:p-8">
          <CardTitle>A week in one sitting</CardTitle>
          <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">Line up several ideas and let Batkle draft them all.</p>
          <div className="mt-5 grid grid-cols-7 gap-1.5" aria-hidden="true">
            {days.map((d, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <span className="text-[11px] font-bold text-bk-muted">{d}</span>
                <span className={cn('aspect-square w-full max-w-[42px] rounded-[5px]', i % 2 === 0 ? 'bg-bk-butter' : 'bg-bk-chip')} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </Section>
  )
}

function WhoItsFor() {
  return (
    <Section id="who-its-for">
      <Eyebrow>Who it&apos;s for</Eyebrow>
      <SectionTitle className="max-w-[13.6em]">Made for people with better things to do than design posts.</SectionTitle>
      <div className="mt-12 grid gap-5 sm:mt-14 md:grid-cols-3">
        {AUDIENCES.map((a, i) => (
          <Card key={a.title} i={i + 2} lift className="flex flex-col p-6 sm:p-7">
            <CardTitle>{a.title}</CardTitle>
            <p className="mt-3 text-[17px] leading-relaxed text-bk-muted">{a.body}</p>
            <Link
              href={START_HREF}
              className="group mt-auto inline-flex items-center gap-2 pt-7 text-[15px] font-bold text-bk-fg"
            >
              {a.cta}
              <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
            </Link>
          </Card>
        ))}
      </div>
    </Section>
  )
}

function BeforeAfter() {
  return (
    <Section tone="alt">
      <SectionTitle className="max-w-[10em]">Your posting routine, before and after.</SectionTitle>
      <div className="mt-12 grid gap-5 sm:mt-14 md:grid-cols-2">
        <Card i={2} className="p-6 sm:p-9">
          <CardTitle className="text-bk-muted">Without Batkle</CardTitle>
          <ul className="mt-6 space-y-3.5">
            {WITHOUT.map((item) => (
              <li key={item} className="flex gap-3 text-[17px] text-bk-muted">
                <X className="mt-[3px] size-[18px] shrink-0" aria-hidden="true" />
                {item}
              </li>
            ))}
          </ul>
        </Card>
        <div {...reveal(3)} className="rounded-2xl border border-bk-fg bg-bk-surface p-6 shadow-bk-pop sm:p-9">
          <CardTitle>With Batkle</CardTitle>
          <ul className="mt-6 space-y-3.5">
            {WITH.map((item) => (
              <li key={item} className="flex gap-3 text-[17px]">
                <span className="mt-[2px] flex size-5 shrink-0 items-center justify-center rounded-full bg-bk-butter text-bk-ink">
                  <Check className="size-3" strokeWidth={3} aria-hidden="true" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </Section>
  )
}

function Testimonials() {
  return (
    <Section>
      <SectionTitle>What customers say.</SectionTitle>
      <div className="mt-12 grid gap-5 sm:mt-14 md:grid-cols-2">
        {QUOTES.map((quote, i) => (
          <Card as="figure" key={quote} i={i + 2} className="p-6 sm:p-9">
            <blockquote className="font-bk-display text-[21px] font-bold leading-snug tracking-[-0.02em] sm:text-[24px]">
              {quote}
            </blockquote>
            <figcaption className="mt-6 flex items-center gap-3 text-[15px] text-bk-muted">
              <span aria-hidden="true" className="size-[42px] rounded-full border border-bk-line bg-bk-chip" />
              [Name, role, brand]
            </figcaption>
          </Card>
        ))}
      </div>
    </Section>
  )
}

function Pricing() {
  return (
    <Section id="pricing" tone="alt">
      <Eyebrow>Pricing</Eyebrow>
      <SectionTitle>Simple pricing, no surprises.</SectionTitle>
      <p {...reveal(2)} className="mt-4 text-[17px] uppercase text-bk-muted">[Add your real plans, prices and free trial details below]</p>
      <div className="mt-12 grid gap-5 sm:mt-14 md:grid-cols-3">
        {PLANS.map((plan, i) => (
          <div
            key={i}
            {...reveal(i + 2)}
            className={cn(
              'relative flex flex-col rounded-2xl border bg-bk-surface p-6 lg:p-8',
              plan.popular ? 'border-bk-fg shadow-bk-pop' : 'border-bk-line shadow-bk-card',
              liftClass,
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-bk-display text-[19px] font-bold tracking-[-0.02em]">[PLAN NAME]</h3>
              {plan.popular && (
                <span className="rounded-full bg-bk-butter px-3 py-1 text-[12px] font-bold text-bk-ink md:absolute md:right-5 md:top-0 md:-translate-y-1/2 lg:static lg:translate-y-0">
                  Most popular
                </span>
              )}
            </div>
            <p className={cn(displayClass, 'mt-6 text-[40px] leading-none lg:text-[46px]')}>[PRICE]</p>
            <ul className="mt-6 space-y-3 text-[16px] text-bk-muted">
              <li>[FEATURE ONE]</li>
              <li>[FEATURE TWO]</li>
              <li>[FEATURE THREE]</li>
            </ul>
            <Link href={START_HREF} className={buttonClass(plan.popular ? 'primary' : 'outline', 'md', 'mt-7 w-full')}>
              Get started
            </Link>
          </div>
        ))}
      </div>
    </Section>
  )
}

function Faq() {
  return (
    <Section id="faq">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,740px)] lg:gap-16">
        <div>
          <Eyebrow>FAQ</Eyebrow>
          <SectionTitle className="max-w-[7.6em]">Frequently asked questions</SectionTitle>
        </div>
        <div {...reveal(2)} className="border-t border-bk-line">
          {FAQS.map((item) => (
            <details key={item.q} className="bk-faq group border-b border-bk-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-[22px] text-[17px] font-bold transition-colors can-hover:text-bk-fg/75 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-bk-fg sm:text-[18px] [&::-webkit-details-marker]:hidden">
                {item.q}
                <Plus className="size-5 shrink-0 transition-transform duration-300 group-open:rotate-45" aria-hidden="true" />
              </summary>
              <p className="bk-faq-answer -mt-1 max-w-[620px] pb-6 text-[17px] leading-relaxed text-bk-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  )
}

function FinalCta() {
  return (
    <section className="bg-bk-bg pb-20 sm:pb-28 lg:pb-[120px]">
      <Container>
        <div {...reveal(0)} className="relative overflow-hidden rounded-[20px] bg-bk-ink px-6 pb-14 pt-32 sm:px-12 sm:py-20 lg:px-16 lg:py-[84px] dark:bg-bk-surface dark:ring-1 dark:ring-inset dark:ring-bk-line">
          <HangingBat
            className="absolute right-8 top-0 text-[44px] text-bk-butter sm:right-[10%] sm:text-[60px]"
            stemClassName="h-[44px] sm:h-[96px]"
          />
          <h2 className={cn(displayClass, 'max-w-[9em] text-[clamp(34px,4vw,54px)] leading-[1.05] text-bk-cream')}>
            Your feed won&apos;t fill itself. Let Batkle do the heavy lifting.
          </h2>
          <p className="mt-6 max-w-[500px] text-[18px] leading-relaxed text-[#C4C1CE] sm:text-[19px]">
            Start with one idea and see your first post take shape in minutes.
          </p>
          <Link href={START_HREF} className={buttonClass('primary', 'lg', 'mt-8')}>
            Create your first post <ArrowRight className={arrowClass} aria-hidden="true" />
          </Link>
        </div>
      </Container>
    </section>
  )
}

function Footer() {
  return (
    <footer className="border-t border-bk-line bg-bk-bg">
      <Container className="flex flex-col gap-12 py-14 sm:py-16 md:flex-row md:justify-between">
        <div>
          <BatkleLogo size={34} />
          <p className="mt-4 max-w-[340px] text-[15px] leading-relaxed text-bk-muted">
            AI-made Instagram posts for people with better things to do.
          </p>
        </div>
        <div className="flex gap-16">
          {FOOTER_LINKS.map((group) => (
            <nav key={group.title} aria-label={group.title}>
              <p className="text-[13px] font-bold uppercase tracking-[0.12em] text-bk-muted">{group.title}</p>
              <ul className="mt-5 space-y-3.5">
                {group.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-[15px] text-bk-fg/90 transition-colors hover:text-bk-fg hover:underline hover:underline-offset-4">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </Container>
      <div className="border-t border-bk-line">
        <Container className="py-6 text-[14px] text-bk-muted">© {new Date().getFullYear()} Batkle. All rights reserved.</Container>
      </div>
    </footer>
  )
}

export default function LandingPage({ className = '' }) {
  return (
    <div className={cn('bk-root min-h-screen bg-bk-bg font-bk-body text-bk-fg antialiased', className)}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-bk-butter focus:px-4 focus:py-2 focus:font-bold focus:text-bk-ink"
      >
        Skip to content
      </a>
      <ScrollReveal />
      <CustomCursor />
      <LandingHeader />
      <main id="main">
        <Hero />
        <HowItWorks />
        <LiveDemo />
        <Features />
        <WhoItsFor />
        <BeforeAfter />
        <Testimonials />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  )
}
