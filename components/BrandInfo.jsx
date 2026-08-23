'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

export default function BrandInfo({ flowId }) {
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [extractedData, setExtractedData] = useState(null)

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
        body: JSON.stringify({ url: url.trim() }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to extract business information')
      }

      const data = await response.json()
      setExtractedData({
        name: data.name || '',
        about: data.about || '',
        language: data.language || 'unknown',
        logo: data.logo || '',
        colors: data.designSystem?.colors || [],
        fonts: data.designSystem?.fonts || [],
      })
      toast.success('Business information extracted successfully')
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

  const handleSave = () => {
    // TODO: Save to database
    toast.success('Brand information saved')
  }

  return (
    <div className="space-y-6">
      {/* URL Input Section */}
      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="url" className="text-base font-semibold mb-2 block">
              Website URL
            </Label>
            <div className="flex gap-2">
              <Input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                disabled={loading}
                className="flex-1"
              />
              <Button
                onClick={handleExtract}
                disabled={loading}
                className="min-w-[120px]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  'Extract'
                )}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {/* Extracted Data Section */}
      {extractedData && (
        <>
          {/* Business Name */}
          <Card className="p-6">
            <div>
              <Label htmlFor="name" className="text-base font-semibold mb-2 block">
                Business Name
              </Label>
              <Input
                id="name"
                type="text"
                value={extractedData.name}
                onChange={(e) => handleFieldChange('name', e.target.value)}
                placeholder="Business name"
              />
            </div>
          </Card>

          {/* Logo and Language */}
          <Card className="p-6">
            <div className="grid grid-cols-2 gap-6">
              {/* Logo */}
              <div>
                <Label className="text-base font-semibold mb-2 block">Logo</Label>
                <div className="border rounded-lg p-4 bg-slate-50 dark:bg-slate-900 min-h-[200px] flex items-center justify-center">
                  {extractedData.logo ? (
                    <img
                      src={extractedData.logo}
                      alt="Brand logo"
                      className="max-w-full max-h-[180px] object-contain"
                    />
                  ) : (
                    <div className="text-slate-400 text-center">
                      <p>No logo found</p>
                      <Input
                        type="url"
                        placeholder="Enter logo URL"
                        value={extractedData.logo}
                        onChange={(e) => handleFieldChange('logo', e.target.value)}
                        className="mt-2"
                      />
                    </div>
                  )}
                </div>
                {extractedData.logo && (
                  <Input
                    type="url"
                    value={extractedData.logo}
                    onChange={(e) => handleFieldChange('logo', e.target.value)}
                    className="mt-2"
                    placeholder="Update logo URL"
                  />
                )}
              </div>

              {/* Language */}
              <div>
                <Label htmlFor="language" className="text-base font-semibold mb-2 block">
                  Language
                </Label>
                <Input
                  id="language"
                  type="text"
                  value={extractedData.language}
                  onChange={(e) => handleFieldChange('language', e.target.value)}
                  placeholder="Language code (e.g., en, pt, fr)"
                  className="bg-slate-100 dark:bg-slate-800"
                />
              </div>
            </div>
          </Card>

          {/* About */}
          <Card className="p-6">
            <div>
              <Label htmlFor="about" className="text-base font-semibold mb-2 block">
                About
              </Label>
              <Textarea
                id="about"
                value={extractedData.about}
                onChange={(e) => handleFieldChange('about', e.target.value)}
                placeholder="Business description"
                rows={6}
              />
            </div>
          </Card>

          {/* Design System - Colors */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Brand Colors</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={addColor}
              >
                Add Color
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {extractedData.colors.length === 0 ? (
                <p className="text-slate-500 text-sm col-span-2">No colors detected</p>
              ) : (
                extractedData.colors.map((color, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleColorChange(index, e.target.value)}
                      className="h-10 w-12 border rounded cursor-pointer"
                    />
                    <Input
                      type="text"
                      value={color}
                      onChange={(e) => handleColorChange(index, e.target.value)}
                      placeholder="#000000"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeColor(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Design System - Fonts */}
          <Card className="p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Brand Fonts</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={addFont}
              >
                Add Font
              </Button>
            </div>
            <div className="space-y-2">
              {extractedData.fonts.length === 0 ? (
                <p className="text-slate-500 text-sm">No fonts detected</p>
              ) : (
                extractedData.fonts.map((font, index) => (
                  <div key={index} className="flex gap-2">
                    <Input
                      type="text"
                      value={font}
                      onChange={(e) => handleFontChange(index, e.target.value)}
                      placeholder="Font name (e.g., Inter, Georgia)"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => removeFont(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Save Button */}
          <div className="flex gap-3">
            <Button
              onClick={handleSave}
              className="flex-1"
              size="lg"
            >
              Save Brand Information
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
