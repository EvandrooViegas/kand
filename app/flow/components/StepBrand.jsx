'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertCircle, ArrowRight, Check, Globe, RefreshCw,
  Building2, BookOpen, Users, Mic2, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { BEBAS } from '../constants'

const ICON_MAP = {
  Building2, BookOpen, Users, Mic2, Sparkles
}

const FIELDS = [
  {
    key: 'businessName',
    label: 'Business name',
    icon: 'Building2',
    placeholder: 'Acme Coffee Co.',
    question: 'What is your business called?',
    required: true,
  },
  {
    key: 'description',
    label: 'What you do',
    icon: 'BookOpen',
    placeholder: 'We roast single-origin beans and ship them fresh across Europe.',
    question: 'In 2-3 sentences, what do you actually do?',
    required: true,
    multiline: true,
  },
  {
    key: 'audience',
    label: 'Who you serve',
    icon: 'Users',
    placeholder: 'Home baristas who care about specialty coffee.',
    question: 'Who is your ideal customer?',
    multiline: false,
  },
  {
    key: 'voice',
    label: 'Voice / personality',
    icon: 'Mic2',
    placeholder: 'Warm, curious, a little nerdy about the craft.',
    question: 'How does your brand sound in one sentence?',
    multiline: false,
  },
  {
    key: 'extra',
    label: 'One insider truth',
    icon: 'Sparkles',
    placeholder: 'Most competitors over-roast to hide bad beans. We do the opposite.',
    question: 'What is the ONE thing you wish customers knew?',
    multiline: true,
  },
]

export function StepBrand({
  brand,
  onChange,
  extractedContext,
  onExtractedContextChange,
  onAdvance,
}) {
  const [websiteUrl, setWebsiteUrl] = useState('')
  const [extractLoading, setExtractLoading] = useState(false)
  const [extractError, setExtractError] = useState(null)
  const [extractedFlash, setExtractedFlash] = useState(false)

  const requiredKeys = FIELDS.filter((f) => f.required).map((f) => f.key)
  const canContinue = requiredKeys.every((k) => (brand[k] || '').trim().length > 0)
  const filledCount = FIELDS.filter((f) => (brand[f.key] || '').trim().length > 0).length

  const extractFromWebsite = async () => {
    if (!websiteUrl.trim()) {
      setExtractError('Please enter a valid URL')
      return
    }
    setExtractLoading(true)
    setExtractError(null)
    try {
      const res = await fetch('/api/extract-brand-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl.trim() }),
      })
      const data = await res.json()
      if (data.info) {
        setExtractError(data.info)
        toast.info(data.info)
        return
      }
      if (data.error) {
        setExtractError(data.error)
        toast.error(data.error)
        return
      }
      if (!res.ok) throw new Error(data.error || 'Failed to extract brand info')

      const updated = { ...brand }
      if (data.businessName) updated.businessName = data.businessName
      if (data.description) updated.description = data.description
      if (data.targetAudience) updated.audience = data.targetAudience
      if (data.brandVoice) updated.voice = data.brandVoice
      if (data.extra) updated.extra = data.extra
      onChange(updated)

      const contextString = [
        data.businessName,
        data.description,
        data.targetAudience,
        data.brandVoice,
        data.extra,
      ]
        .filter(Boolean)
        .join('\n')
      onExtractedContextChange(contextString)

      setExtractedFlash(true)
      setTimeout(() => setExtractedFlash(false), 1400)
      toast.success('Website analysed. Review the details below and continue.')
    } catch (e) {
      setExtractError(e.message || 'Failed to extract brand info')
      toast.error(e.message || 'Failed to extract brand info')
    } finally {
      setExtractLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 style={{ ...BEBAS, fontSize: 26 }}>TELL US ABOUT YOU</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Paste a website to auto-fill the essentials, or answer the questions below directly.
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Filled</p>
          <p className="text-2xl font-bold" style={BEBAS}>
            {filledCount}/{FIELDS.length}
          </p>
        </div>
      </div>

      <div
        className={`rounded-2xl border-2 p-4 transition-colors ${
          extractedFlash
            ? 'border-[#D4FF00] bg-[#D4FF00]/10'
            : 'border-foreground/10 bg-foreground/[0.02]'
        }`}
      >
        <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
          <Globe className="w-3.5 h-3.5 text-foreground" />
          Auto-fill from your website
        </Label>
        <p className="text-[11px] text-muted-foreground mb-2.5">
          We read your homepage (title, meta description, structured data) and pre-fill the
          answers below.
        </p>
        <div className="flex gap-2">
          <Input
            type="url"
            className="text-sm flex-1"
            placeholder="https://your-brand.com"
            value={websiteUrl}
            onChange={(e) => {
              setWebsiteUrl(e.target.value)
              setExtractError(null)
            }}
            onKeyDown={(e) => e.key === 'Enter' && extractFromWebsite()}
            disabled={extractLoading}
          />
          <Button
            onClick={extractFromWebsite}
            disabled={extractLoading || !websiteUrl.trim()}
            className="bg-foreground text-background hover:bg-foreground/85 font-semibold px-5"
          >
            {extractLoading ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Reading...
              </>
            ) : (
              'Auto-fill'
            )}
          </Button>
        </div>
        {extractError && (
          <div className="flex items-start gap-2 p-2 rounded mt-2 bg-blue-600/10 border border-blue-600/30">
            <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <p className="text-[10px] text-blue-600">{extractError}</p>
          </div>
        )}
      </div>

      <div className="relative flex items-center gap-3">
        <div className="flex-1 border-t border-foreground/10"></div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground px-2">
          or answer directly
        </span>
        <div className="flex-1 border-t border-foreground/10"></div>
      </div>

      <div className="space-y-4">
        {FIELDS.map(({ key, label, icon, placeholder, multiline, question, required }, idx) => {
          const Icon = ICON_MAP[icon]
          const filled = (brand[key] || '').trim().length > 0
          return (
            <div
              key={key}
              className="animate-in fade-in slide-in-from-bottom-1 duration-300"
              style={{ animationDelay: `${idx * 40}ms` }}
            >
              <div className="flex items-baseline justify-between mb-1.5">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  {label}
                  {required && (
                    <span className="text-[10px] text-muted-foreground font-normal">
                      (required)
                    </span>
                  )}
                </Label>
                {filled && <Check className="w-3.5 h-3.5 text-emerald-600" />}
              </div>
              <p className="text-[11px] text-muted-foreground mb-1.5 italic">{question}</p>
              {multiline ? (
                <Textarea
                  rows={3}
                  className="text-sm"
                  placeholder={placeholder}
                  value={brand[key] || ''}
                  onChange={(e) => onChange({ ...brand, [key]: e.target.value })}
                />
              ) : (
                <Input
                  className="text-sm"
                  placeholder={placeholder}
                  value={brand[key] || ''}
                  onChange={(e) => onChange({ ...brand, [key]: e.target.value })}
                />
              )}
            </div>
          )
        })}
      </div>

      <div className="flex justify-end pt-2">
        <Button
          onClick={onAdvance}
          disabled={!canContinue}
          className="bg-foreground text-background hover:bg-foreground/85 font-semibold rounded-full px-6 h-10"
        >
          Continue
          <ArrowRight className="w-4 h-4 ml-1.5" />
        </Button>
      </div>
    </div>
  )
}
