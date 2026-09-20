'use client'
import BrandDesignStudio from '@/components/BrandDesignStudio'
import ImageDispositionPicker from '@/components/ImageDispositionPicker'
import BusinessResearchDetails from '@/components/BusinessResearchDetails'
import { loadEnglishProfile } from '@/lib/client/englishProfile'

import ColorPriority, { reorderColors } from '@/components/ColorPriority'
import { useState, useEffect } from 'react'
import LogoVariants from '@/components/LogoVariants'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { Loader2, Globe, Image as ImageIcon, Save, Plus, X, Copy } from 'lucide-react'

export default function BrandInfo({ flowId, flows = [], onFlowCreated, onFlowSelect }) {
  const [url, setUrl] = useState('')
  const [activeTab, setActiveTab] = useState('business')
  const [translating, setTranslating] = useState(false)
  const [translationError, setTranslationError] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extractedData, setExtractedData] = useState(null)
  const [loadedFonts, setLoadedFonts] = useState(new Set())
  const [fontLoadingErrors, setFontLoadingErrors] = useState(new Set())

  // Load persisted brand context whenever the selected flow changes
  useEffect(() => {
    if (!flowId) return
    let active = true
    setExtractedData(null)
    setTranslationError('')
    setTranslating(false)
    fetch(`/api/flows/${flowId}`)
      .then(r => r.json())
      .then(async flow => {
        if (!active) return
        let bc = flow?.brandContext
        if (bc?.about && bc.profileLanguage !== 'en') {
          setTranslating(true)
          try { bc = await loadEnglishProfile(flowId, bc) } catch (error) { if (active) setTranslationError(error.message) }
          finally { if (active) setTranslating(false) }
        }
        if (!active) return
        if (bc && (bc.name || bc.about || bc.colors?.length || bc.fonts?.length)) {
          setExtractedData({
            ...bc,
            name:     bc.name     || '',
            about:    bc.about    || '',
            logo:     bc.logo     || '',
            logoVariants: bc.logoVariants || null,
            language: bc.language || '',
            colors:   bc.colors   || [],
            fonts:    bc.fonts    || [],
          })
        }
      })
      .catch(() => {})
    return () => { active = false }
  }, [flowId])

  // Function to normalize font names (remove -Bold, -Regular, etc.)
  const normalizeFontName = (fontName) => {
    if (!fontName) return ''
    // Remove weight/style suffixes
    return fontName
      .replace(/-?(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)/gi, '')
      .replace(/-?(Italic|Oblique)/gi, '')
      .trim()
  }

  // Function to load a Google Font dynamically
  const loadGoogleFont = (fontName) => {
    const normalizedFont = normalizeFontName(fontName)
    
    if (!normalizedFont || loadedFonts.has(normalizedFont) || fontLoadingErrors.has(normalizedFont)) {
      return
    }

    // Create a link element to load the font from Google Fonts
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${normalizedFont.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`
    
    // Set a timeout to mark as loaded after a reasonable time
    const timeoutId = setTimeout(() => {
      setLoadedFonts(prev => new Set([...prev, normalizedFont]))
    }, 2000) // 2 seconds max wait
    
    link.onload = () => {
      clearTimeout(timeoutId)
      setLoadedFonts(prev => new Set([...prev, normalizedFont]))
    }
    
    link.onerror = () => {
      clearTimeout(timeoutId)
      console.warn(`Failed to load font: ${normalizedFont}`)
      setFontLoadingErrors(prev => new Set([...prev, normalizedFont]))
      setLoadedFonts(prev => new Set([...prev, normalizedFont])) // Mark as "loaded" to stop showing loading state
    }
    
    document.head.appendChild(link)
  }

  // Load fonts when extractedData changes
  useEffect(() => {
    if (extractedData?.fonts) {
      extractedData.fonts.forEach(font => {
        if (font) loadGoogleFont(font)
      })
    }
  }, [extractedData?.fonts?.length]) // Only depend on length to avoid infinite loops

  const handleExtract = async () => {
    if (!url.trim()) {
      toast.error('Please enter a URL')
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/extract-business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim(), flowId }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to extract business information')
      }

      const data = await response.json()
      if (data.logoVariantsError) toast.warning(data.logoVariantsError)
      
        setExtractedData({
          ...data.flow?.brandContext,
          name: data.name || '',
          about: data.about || '',
          language: data.language || 'unknown',
          logo: data.logo || '',
          logoVariants: data.logoVariants || null,
          colors: data.designSystem?.colors || [],
          fonts: data.designSystem?.fonts || [],
        })
        onFlowCreated?.(data.flow)
        toast.success(`Brand saved from ${data.pagesAnalyzed} pages. ${data.imageImport?.imported || 0} images added to the gallery.`)
        if (data.imageImport?.skipped) toast.warning(`${data.imageImport.skipped} website images could not be imported or were too small.`)

    } catch (error) {
      console.error('Extraction error:', error)
      toast.error(error.message || 'Failed to extract business information')
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (field, value) => {
    setExtractedData({
      ...extractedData,
      [field]: value,
    })
  }

  const handleColorChange = (index, value) => {
    const updatedColors = [...extractedData.colors]
    updatedColors[index] = value
    setExtractedData({
      ...extractedData,
      colors: updatedColors,
    })
  }

  const addColor = () => {
    setExtractedData({
      ...extractedData,
      colors: [...extractedData.colors, '#000000'],
    })
  }

  const removeColor = (index) => {
    setExtractedData({
      ...extractedData,
      colors: extractedData.colors.filter((_, i) => i !== index),
    })
  }

  const handleFontChange = (index, value) => {
    const updatedFonts = [...extractedData.fonts]
    updatedFonts[index] = value
    setExtractedData({
      ...extractedData,
      fonts: updatedFonts,
    })
    // Load the new font
    if (value) loadGoogleFont(value)
  }

  const addFont = () => {
    setExtractedData({
      ...extractedData,
      fonts: [...extractedData.fonts, ''],
    })
  }

  const removeFont = (index) => {
    setExtractedData({
      ...extractedData,
      fonts: extractedData.fonts.filter((_, i) => i !== index),
    })
  }

  const handleSave = async () => {
    if (!extractedData) return
    setSaving(true)
    try {
      let targetFlowId = flowId

      // If there's no active flow yet, create one named after the brand
      if (!targetFlowId) {
        const newFlowName = extractedData.name
          ? `${extractedData.name} Flow`
          : `Flow ${Date.now()}`
        const res = await fetch('/api/flows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newFlowName }),
        })
        if (!res.ok) throw new Error('Failed to create flow')
        const newFlow = await res.json()
        targetFlowId = newFlow.id
        onFlowCreated?.(newFlow)
      }

      // Persist the brand data into the flow's brandContext field
      const res = await fetch(`/api/flows/${targetFlowId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext: {
            ...extractedData,
            name: extractedData.name,
            about: extractedData.about,
            logo: extractedData.logo,
            logoVariants: extractedData.logoVariants?.source === extractedData.logo ? extractedData.logoVariants : null,
            language: extractedData.language,
            colors: extractedData.colors,
            fonts: extractedData.fonts,
            imageDisposition: extractedData.imageDisposition || 'cutout',
            designs: extractedData.designs || [],
          },
          // Also update the flow name to the brand name if it looks like a default name
          ...(extractedData.name ? { name: extractedData.name } : {}),
        }),
      })
      if (!res.ok) throw new Error('Failed to save brand information')

      const updatedFlow = await res.json()
      // Notify the parent so the sidebar name refreshes
      onFlowCreated?.(updatedFlow)

      toast.success('Brand information saved')
    } catch (error) {
      console.error('Save error:', error)
      toast.error(error.message || 'Failed to save brand information')
    } finally {
      setSaving(false)
    }
  }

  const copyColorToClipboard = (color) => {
    navigator.clipboard.writeText(color)
    toast.success(`Copied ${color} to clipboard`)
  }

  return (
    <div className="space-y-6 pb-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><p className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Brand workspace</p><h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">Brand personalization</h1><p className="mt-2 text-sm text-slate-500">Your business, your voice, your visual identity.</p></div>
        {extractedData && <Button onClick={handleSave} disabled={saving || loading || translating} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Save changes</Button>}
      </header>

      <details open={!extractedData} className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
        <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-700 dark:text-slate-200">Import from your website<span className="ml-2 text-xs font-normal text-slate-400">Up to 5 pages</span></summary>
        <div className="border-t border-slate-100 p-5 dark:border-slate-800"><p className="mb-4 text-sm leading-6 text-slate-500">Bring in your services, projects and business details. Useful photos are added to your gallery.</p><div className="flex flex-col gap-3 sm:flex-row"><Input aria-label="Business website URL" type="url" placeholder="https://your-business.com" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && !loading && !translating && handleExtract()} disabled={loading || translating} className="h-11 flex-1" /><Button onClick={handleExtract} disabled={loading || translating} className="h-11 bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Globe className="mr-2 h-4 w-4" />}{loading ? 'Reading website…' : 'Import website'}</Button></div>{loading && <p role="status" className="mt-4 text-xs text-slate-500">Reading relevant pages and preparing your brand profile. This can take a moment.</p>}</div>
      </details>
      {translating && <div role="status" className="flex items-center gap-3 rounded-xl border p-5 text-sm text-slate-500"><Loader2 size={16} className="animate-spin" />Preparing your English business profile…</div>}
      {translationError && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{translationError}</p>}

      {extractedData && <>
        <div className="flex items-center gap-4 py-2"><div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white p-2">{extractedData.logo ? <img src={(extractedData.logoVariants?.source === extractedData.logo && extractedData.logoVariants?.blackTransparent) || extractedData.logo} alt={`${extractedData.name} logo`} className="max-h-full max-w-full object-contain" /> : <ImageIcon className="h-6 w-6 text-slate-300" />}</div><div className="min-w-0"><h2 className="break-words text-lg font-semibold tracking-tight">{extractedData.name || 'Your business'}</h2><div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">{extractedData.profileLanguage === 'en' && <span>English profile</span>}{extractedData.researchSources?.length > 0 && <span>{extractedData.researchSources.length} source {extractedData.researchSources.length === 1 ? 'page' : 'pages'}</span>}<span>Post language: {extractedData.language || 'Not set'}</span></div></div></div>
        <div role="tablist" aria-label="Brand settings" className="flex gap-5 overflow-x-auto border-b border-slate-200 dark:border-slate-800">{[['business', 'Business profile'], ['identity', 'Visual identity'], ['design', 'Post design']].map(([id, label]) => <button type="button" key={id} role="tab" aria-selected={activeTab === id} aria-controls={`brand-panel-${id}`} id={`brand-tab-${id}`} onClick={() => setActiveTab(id)} className={`shrink-0 border-b-2 px-1 pb-3 pt-1 text-sm font-medium transition-colors ${activeTab === id ? 'border-slate-900 text-slate-900 dark:border-white dark:text-white' : 'border-transparent text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>{label}</button>)}</div>

        <div role="tabpanel" id={`brand-panel-${activeTab}`} aria-labelledby={`brand-tab-${activeTab}`}>
          {activeTab === 'business' && <BusinessResearchDetails data={extractedData} onChange={handleFieldChange} showOverview />}
          {activeTab === 'identity' && <div className="space-y-5">
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950"><h3 className="text-base font-semibold">Brand logo</h3><p className="mb-5 mt-1 text-xs text-slate-500">Your original logo and transparent variants.</p><LogoVariants key={String(flowId) + extractedData.logo} logo={extractedData.logo} variants={extractedData.logoVariants} onChange={variants => setExtractedData(prev => prev.logo === variants.source ? { ...prev, logoVariants: variants } : prev)} /><label className="mt-5 block text-xs font-medium text-slate-500">Original logo URL<Input type="url" value={extractedData.logo} onChange={e => handleFieldChange('logo', e.target.value)} className="mt-2" /></label></section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Color palette</h3><p className="mt-1 text-xs text-slate-500">Primary first. Reorder colors by importance.</p></div><Button variant="outline" size="sm" onClick={addColor}><Plus size={14} className="mr-1" />Add color</Button></div><div className="space-y-3">{extractedData.colors.map((color, index) => <div key={index} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-3 dark:border-slate-800"><ColorPriority index={index} count={extractedData.colors.length} onMove={(from, to) => setExtractedData(prev => ({ ...prev, colors: reorderColors(prev.colors, from, to) }))} /><input aria-label={`Color ${index + 1}`} type="color" value={color} onChange={e => handleColorChange(index, e.target.value)} className="h-9 w-9 cursor-pointer rounded border-0 bg-transparent" /><Input aria-label={`Color ${index + 1} hex value`} value={color} onChange={e => handleColorChange(index, e.target.value)} className="min-w-0 flex-1 font-mono text-xs" /><button aria-label={`Copy color ${index + 1}`} onClick={() => copyColorToClipboard(color)} className="p-1 text-slate-400"><Copy size={15} /></button><button aria-label={`Remove color ${index + 1}`} onClick={() => removeColor(index)} className="p-1 text-slate-400 hover:text-red-600"><X size={15} /></button></div>)}{!extractedData.colors.length && <p className="text-sm text-slate-400">Add your first brand color.</p>}</div></section>
            <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950"><div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="text-base font-semibold">Typography</h3><p className="mt-1 text-xs text-slate-500">The typefaces used across your posts.</p></div><Button variant="outline" size="sm" onClick={addFont}><Plus size={14} className="mr-1" />Add font</Button></div><div className="divide-y divide-slate-100 dark:divide-slate-800">{extractedData.fonts.map((font, index) => <div key={index} className="space-y-4 py-5 first:pt-0 last:pb-0"><div className="flex gap-3"><Input aria-label={`Font ${index + 1}`} value={font} onChange={e => handleFontChange(index, e.target.value)} /><button aria-label={`Remove font ${index + 1}`} onClick={() => removeFont(index)} className="px-1 text-slate-400 hover:text-red-600"><X size={16} /></button></div><div style={{ fontFamily: `"${normalizeFontName(font)}", sans-serif` }}><p className="break-words text-2xl">{normalizeFontName(font) || 'Your typeface'}</p><p className="mt-2 text-sm text-slate-500">The quick brown fox jumps over the lazy dog.</p></div></div>)}</div></section>
          </div>}
          {activeTab === 'design' && <div className="space-y-5"><section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950"><label className="text-sm font-semibold">Post language<Input value={extractedData.language} onChange={e => handleFieldChange('language', e.target.value)} className="mt-3 max-w-sm" /></label><p className="mt-2 text-xs text-slate-500">Your profile is in English. Posts follow this language setting.</p></section><section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6 dark:border-slate-800 dark:bg-slate-950"><h3 className="text-base font-semibold">Default image style</h3><p className="mb-5 mt-1 text-xs leading-5 text-slate-500">Choose the starting style for new posts. You can change it for an individual post in step-by-step mode.</p><ImageDispositionPicker value={extractedData.imageDisposition || 'cutout'} onChange={imageDisposition => setExtractedData(prev => ({ ...prev, imageDisposition }))} /></section><BrandDesignStudio flowId={flowId} brand={extractedData} onChange={setExtractedData} /></div>}
        </div>
        <footer className="sticky bottom-0 z-10 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-1 py-4 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95"><p className="text-xs text-slate-400">Used to shape your future posts.</p><Button onClick={handleSave} disabled={saving || loading || translating} className="bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900">{saving && <Loader2 size={14} className="mr-2 animate-spin" />}{saving ? 'Saving…' : 'Save changes'}</Button></footer>
      </>}
    </div>
  )
}
