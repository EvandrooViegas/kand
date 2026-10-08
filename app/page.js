import LandingPage from '@/components/landing/LandingPage'
import { batkleFonts } from '@/lib/batkleFonts'
import '@/components/landing/landing.css'

export const metadata = {
  title: 'Batkle | Paste your website. Get on-brand Instagram posts.',
  description:
    'Batkle learns your brand from your website, then writes the ideas and designs the posts in your language, colors, fonts and logo.',
  icons: { icon: '/logo/batkle-icon-color.png' },
}

export default function Home() {
  return <LandingPage className={batkleFonts} />
}
