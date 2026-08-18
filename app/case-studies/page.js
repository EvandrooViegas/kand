'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Moon, Sun, ArrowLeft } from 'lucide-react'
import { KandLogo } from '@/components/logo'
import CaseStudyCard from '@/components/CaseStudyCard'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }

// Sample case studies data
const SAMPLE_CASE_STUDIES = [
  {
    id: 1,
    name: 'TechFlow Inc',
    logo: 'https://via.placeholder.com/150x60?text=TechFlow',
    description: 'Designed and launched their complete product marketing suite with dynamic social templates.',
    services: ['Branding', 'Social Media', 'Marketing'],
    images: [
      'https://via.placeholder.com/1280x720?text=TechFlow+Campaign+1',
      'https://via.placeholder.com/1280x720?text=TechFlow+Campaign+2',
      'https://via.placeholder.com/1280x720?text=TechFlow+Campaign+3',
    ],
  },
  {
    id: 2,
    name: 'Creative Co',
    logo: 'https://via.placeholder.com/150x60?text=Creative+Co',
    description: 'Built dynamic carousel templates for their quarterly campaigns with custom layouts.',
    services: ['Design', 'Campaign Management'],
    images: [
      'https://via.placeholder.com/1280x720?text=Creative+Campaign+1',
      'https://via.placeholder.com/1280x720?text=Creative+Campaign+2',
    ],
  },
  {
    id: 3,
    name: 'Global Brands Ltd',
    logo: 'https://via.placeholder.com/150x60?text=Global+Brands',
    description: 'Created scalable template system for 50+ international regional campaigns.',
    services: ['Template Design', 'Content Strategy', 'Multi-market'],
    images: [
      'https://via.placeholder.com/1280x720?text=Global+Campaign+1',
      'https://via.placeholder.com/1280x720?text=Global+Campaign+2',
      'https://via.placeholder.com/1280x720?text=Global+Campaign+3',
      'https://via.placeholder.com/1280x720?text=Global+Campaign+4',
    ],
  },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <Button variant="ghost" size="icon"><Sun className="w-4 h-4" /></Button>
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  )
}

export default function CaseStudiesPage() {
  const router = useRouter()
  const [caseStudies, setCaseStudies] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initialize case studies from sample data
    setCaseStudies(SAMPLE_CASE_STUDIES)
    setLoading(false)
  }, [])

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground">
      {/* Header */}
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20">
        <div className="container max-w-6xl mx-auto py-4 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
              <ArrowLeft className="w-4 h-4" />
            </Button>
            <KandLogo size={28} />
            <span className="text-xl font-bold" style={BEBAS}>CASE STUDIES</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="container max-w-5xl mx-auto px-4 py-12">
        {/* Page heading */}
        <section className="mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 border border-foreground/80 rounded-full text-xs font-semibold uppercase tracking-widest mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9AB800] animate-pulse" />
            Featured Work
          </div>
          <h1 className="leading-tight mb-4" style={{ ...BEBAS, fontSize: 'clamp(48px, 8vw, 96px)' }}>
            OUR CASE<br />
            <span className="relative inline-block">
              STUDIES<span style={{ color: '#9AB800' }}>.</span>
              <span className="absolute -bottom-2 left-0 right-0 h-1.5 bg-[#D4FF00] -z-10" />
            </span>
          </h1>
          <p className="text-lg max-w-2xl text-foreground/70 leading-relaxed mt-6">
            Explore how we've helped brands create dynamic, scalable design systems that adapt to any campaign.
          </p>
        </section>

        {/* Case Studies Grid - stacked vertically */}
        <div className="space-y-6">
          {loading ? (
            // Loading skeleton
            [1, 2, 3].map((i) => (
              <div
                key={i}
                className="w-full h-96 bg-foreground/5 animate-pulse rounded-xl border-2 border-foreground/90"
              />
            ))
          ) : caseStudies.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>No case studies found.</p>
            </div>
          ) : (
            caseStudies.map((caseStudy) => (
              <CaseStudyCard key={caseStudy.id} caseStudy={caseStudy} />
            ))
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-foreground/90 mt-20 py-8">
        <div className="container max-w-6xl mx-auto px-4 text-center text-foreground/60 text-sm">
          <p>© 2024 Kand Design Studio. All rights reserved.</p>
        </div>
      </footer>
    </div>
  )
}
