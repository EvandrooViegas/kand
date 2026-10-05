import { Bricolage_Grotesque, DM_Sans } from 'next/font/google'
import LandingPage from '@/components/landing/LandingPage'
import '@/components/landing/landing.css'

// opsz lets the browser pick the tighter display cut at large sizes.
const display = Bricolage_Grotesque({ subsets: ['latin'], axes: ['opsz'], variable: '--font-bk-display', display: 'swap' })
const body = DM_Sans({ subsets: ['latin'], variable: '--font-bk-body', display: 'swap' })

export const metadata = {
  title: 'Batkle | Turn a single idea into a finished Instagram post',
  description:
    "Batkle designs the post, writes the caption and suggests the hashtags, all in your brand's colors and voice. You review, adjust and publish.",
  icons: { icon: '/logo/batkle-icon-color.png' },
}

export default function Home() {
  return <LandingPage className={`${display.variable} ${body.variable}`} />
}
