'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Loader2, Sparkles, Globe, Palette, Type, Image as ImageIcon, Save, Plus, X, Check, Copy } from 'lucide-react'

export default function BrandInfo({ flowId, flows = [], onFlowCreated, onFlowSelect }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [extractedData, setExtractedData] = useState(null)
  const [loadedFonts, setLoadedFonts] = useState(new Set())
  const [fontLoadingErrors, setFontLoadingErrors] = useState(new Set())
  const [extractionProgress, setExtractionProgress] = useState([])
  const [currentStep, setCurrentStep] = useState('')

  // Load persisted brand context whenever the selected flow changes
  useEffect(() => {
    if (!flowId) return
    fetch(`/api/flows/${flowId}`)
      .then(r => r.json())
      .then(flow => {
        const bc = flow?.brandContext
        if (bc && (bc.name || bc.about || bc.colors?.length || bc.fonts?.length)) {
          setExtractedData({
            name:     bc.name     || '',
            about:    bc.about    || '',
            logo:     bc.logo     || '',
            language: bc.language || '',
            colors:   bc.colors   || [],
            fonts:    bc.fonts    || [],
          })
        }
      })
      .catch(() => {})
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
    setExtractionProgress([])
    setCurrentStep('')
    
    // Simulate progress steps
    const progressSteps = [
      { step: 'Fetching website...', delay: 300 },
      { step: 'Extracting business information...', delay: 800 },
      { step: 'Analyzing colors...', delay: 1200 },
      { step: 'Detecting fonts...', delay: 1600 },
      { step: 'Processing design system...', delay: 2000 },
    ]

    // Show progress animation
    progressSteps.forEach(({ step, delay }) => {
      setTimeout(() => {
        setCurrentStep(step)
        setExtractionProgress(prev => [...prev, { step, completed: false }])
      }, delay)
    })

    try {
      const response = await fetch('/api/extract-business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to extract business information')
      }

      const data = await response.json()
      
      // Mark all steps as completed
      setExtractionProgress(prev => prev.map(p => ({ ...p, completed: true })))
      setCurrentStep('Extraction complete!')
      
      setTimeout(() => {
        setExtractedData({
          name: data.name || '',
          about: data.about || '',
          language: data.language || 'unknown',
          logo: data.logo || '',
          colors: data.designSystem?.colors || [],
          fonts: data.designSystem?.fonts || [],
        })
        toast.success('Business information extracted successfully')
      }, 500)
    } catch (error) {
      console.error('Extraction error:', error)
      toast.error(error.message || 'Failed to extract business information')
      setExtractionProgress([])
      setCurrentStep('')
    } finally {
      setTimeout(() => {
        setLoading(false)
        setExtractionProgress([])
        setCurrentStep('')
      }, 1000)
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
            name: extractedData.name,
            about: extractedData.about,
            logo: extractedData.logo,
            language: extractedData.language,
            colors: extractedData.colors,
            fonts: extractedData.fonts,
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
    <div className="space-y-8">
      {/* URL Input Section */}
      <Card className="border-2 border-dashed border-primary/20 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <Globe className="w-5 h-5 text-primary" />
            </div>
            <div>
              <CardTitle className="text-lg">Extract Brand Information</CardTitle>
              <CardDescription>Enter a website URL to automatically extract brand details</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3">
            <Input
              id="url"
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleExtract()}
              disabled={loading}
              className="flex-1 h-12 text-base"
            />
            <Button
              onClick={handleExtract}
              disabled={loading}
              size="lg"
              className="min-w-[140px]"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Extracting...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Extract
                </>
              )}
            </Button>
          </div>
          
          {/* Progress Indicator */}
          {loading && extractionProgress.length > 0 && (
            <div className="mt-6 p-4 bg-white dark:bg-slate-900 rounded-lg border-2">
              <div className="space-y-3">
                {extractionProgress.map((progress, index) => (
                  <div 
                    key={index} 
                    className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2"
                    style={{ animationDelay: `${index * 100}ms` }}
                  >
                    {progress.completed ? (
                      <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : (
                      <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
                    )}
                    <span className={`text-sm ${progress.completed ? 'text-green-600 dark:text-green-400' : 'text-slate-700 dark:text-slate-300'}`}>
                      {progress.step}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Progress Bar */}
              <div className="mt-4 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500 ease-out"
                  style={{ 
                    width: `${(extractionProgress.filter(p => p.completed).length / extractionProgress.length) * 100}%` 
                  }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Extracted Data Section */}
      {extractedData && (
        <>
          {/* Brand Overview - Hero Section */}
          <Card className="overflow-hidden border-2">
            <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent p-8">
              <div className="flex items-start gap-6">
                {/* Logo */}
                <div className="flex-shrink-0">
                  <div className="w-32 h-32 rounded-2xl bg-white dark:bg-slate-900 shadow-lg border-2 border-primary/20 flex items-center justify-center p-4 overflow-hidden">
                    {extractedData.logo ? (
                      <img
                        src={extractedData.logo}
                        alt="Brand logo"
                        className="max-w-full max-h-full object-contain"
                      />
                    ) : (
                      <ImageIcon className="w-12 h-12 text-slate-300" />
                    )}
                  </div>
                </div>

                {/* Business Name and Details */}
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h2 className="text-3xl font-bold mb-2">
                        {extractedData.name || 'Untitled Business'}
                      </h2>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          <Globe className="w-3 h-3 mr-1" />
                          {extractedData.language?.toUpperCase() || 'Unknown'}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          <Check className="w-3 h-3 mr-1" />
                          Extracted
                        </Badge>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                    {extractedData.about || 'No description available'}
                  </p>
                </div>
              </div>
            </div>

            {/* Editable Fields */}
            <CardContent className="pt-6 space-y-4">
              <div>
                <Label htmlFor="name" className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  Business Name
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={extractedData.name}
                  onChange={(e) => handleFieldChange('name', e.target.value)}
                  placeholder="Enter business name"
                  className="h-11"
                />
              </div>

              <div>
                <Label htmlFor="about" className="text-sm font-medium mb-2 block">
                  About
                </Label>
                <Textarea
                  id="about"
                  value={extractedData.about}
                  onChange={(e) => handleFieldChange('about', e.target.value)}
                  placeholder="Describe your business..."
                  rows={4}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="logo" className="text-sm font-medium mb-2 block">
                    Logo URL
                  </Label>
                  <Input
                    id="logo"
                    type="url"
                    value={extractedData.logo}
                    onChange={(e) => handleFieldChange('logo', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                </div>
                <div>
                  <Label htmlFor="language" className="text-sm font-medium mb-2 block">
                    Language
                  </Label>
                  <Input
                    id="language"
                    type="text"
                    value={extractedData.language}
                    onChange={(e) => handleFieldChange('language', e.target.value)}
                    placeholder="en, pt, fr, etc."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Brand Colors - Visual Display */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-pink-500/10 to-purple-500/10">
                    <Palette className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle>Brand Colors</CardTitle>
                    <CardDescription>Your color palette ({extractedData.colors.length} colors)</CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addColor}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Color
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {extractedData.colors.length === 0 ? (
                <div className="text-center py-12 px-4 border-2 border-dashed rounded-lg">
                  <Palette className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm mb-4">No colors detected</p>
                  <Button size="sm" variant="outline" onClick={addColor}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Color
                  </Button>
                </div>
              ) : (
                <>
                  {/* Color Preview Grid */}
                  <div className="grid grid-cols-6 gap-3 mb-6">
                    {extractedData.colors.map((color, index) => (
                      <div
                        key={index}
                        className="group relative aspect-square rounded-xl overflow-hidden shadow-md hover:shadow-lg transition-all cursor-pointer border-2 border-slate-200 dark:border-slate-700"
                        style={{ backgroundColor: color }}
                        onClick={() => copyColorToClipboard(color)}
                      >
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <Copy className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1.5 text-center font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                          {color}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Color Editors */}
                  <div className="space-y-3">
                    {extractedData.colors.map((color, index) => (
                      <div key={index} className="flex gap-3 items-center p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border">
                        <input
                          type="color"
                          value={color}
                          onChange={(e) => handleColorChange(index, e.target.value)}
                          className="h-12 w-12 border-2 rounded-lg cursor-pointer"
                        />
                        <Input
                          type="text"
                          value={color}
                          onChange={(e) => handleColorChange(index, e.target.value)}
                          placeholder="#000000"
                          className="flex-1 font-mono"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => copyColorToClipboard(color)}
                          className="hover:bg-primary/10"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeColor(index)}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Brand Fonts */}
          <Card className="border-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-cyan-500/10">
                    <Type className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <CardTitle>Brand Fonts</CardTitle>
                    <CardDescription>Typography system ({extractedData.fonts.length} fonts)</CardDescription>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addFont}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Font
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {extractedData.fonts.length === 0 ? (
                <div className="text-center py-12 px-4 border-2 border-dashed rounded-lg">
                  <Type className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm mb-4">No fonts detected</p>
                  <Button size="sm" variant="outline" onClick={addFont}>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Your First Font
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  {extractedData.fonts.map((font, index) => {
                    const normalizedFont = normalizeFontName(font)
                    const isFontLoaded = loadedFonts.has(normalizedFont)
                    const hasFontError = fontLoadingErrors.has(normalizedFont)
                    
                    return (
                      <div key={index} className="flex gap-3 items-start p-4 rounded-lg bg-slate-50 dark:bg-slate-900/50 border">
                        <div className="flex-1 space-y-3">
                          <div className="flex items-center gap-2">
                            <Input
                              type="text"
                              value={font}
                              onChange={(e) => handleFontChange(index, e.target.value)}
                              placeholder="Font name (e.g., Inter, Roboto)"
                              className="flex-1"
                            />
                            {font && normalizedFont && (
                              <Badge 
                                variant={hasFontError ? "destructive" : isFontLoaded ? "default" : "secondary"} 
                                className="text-xs"
                              >
                                {hasFontError ? "Not Found" : isFontLoaded ? "✓ Loaded" : "Loading..."}
                              </Badge>
                            )}
                          </div>
                          
                          {/* Font Preview */}
                          <div className="bg-white dark:bg-slate-800 rounded-lg border-2 p-4 space-y-2">
                            <div 
                              className="text-3xl font-semibold"
                              style={{ 
                                fontFamily: normalizedFont ? `"${normalizedFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` : 'inherit',
                                fontWeight: font.toLowerCase().includes('bold') ? 'bold' : font.toLowerCase().includes('light') ? '300' : 'normal'
                              }}
                            >
                              {normalizedFont || 'Font Name'}
                            </div>
                            <div 
                              className="text-base text-slate-600 dark:text-slate-400"
                              style={{ 
                                fontFamily: normalizedFont ? `"${normalizedFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` : 'inherit' 
                              }}
                            >
                              The quick brown fox jumps over the lazy dog
                            </div>
                            <div 
                              className="text-sm text-slate-500"
                              style={{ 
                                fontFamily: normalizedFont ? `"${normalizedFont}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` : 'inherit' 
                              }}
                            >
                              ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789
                            </div>
                          </div>
                          
                          {/* Original Font Name Display */}
                          {font !== normalizedFont && (
                            <div className="text-xs text-slate-500 flex items-center gap-2 flex-wrap">
                              <span className="font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                                Original: {font}
                              </span>
                              <span>→</span>
                              <span className="font-mono bg-slate-200 dark:bg-slate-700 px-2 py-1 rounded">
                                Normalized: {normalizedFont}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => removeFont(index)}
                          className="hover:bg-destructive/10 hover:text-destructive flex-shrink-0"
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="sticky bottom-6 z-10">
            <Button
              onClick={handleSave}
              disabled={saving}
              size="lg"
              className="w-full shadow-lg h-14 text-base"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5 mr-2" />
                  Save Brand Information
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
