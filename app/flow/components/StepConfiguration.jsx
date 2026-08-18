import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Loader, RotateCw } from 'lucide-react'

export default function StepConfiguration({ flow, onUpdate }) {
  const [phase, setPhase] = useState(flow.businessContext ? 'view' : 'url')
  const [url, setUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [context, setContext] = useState(flow.businessContext || null)

  const extractBusinessInfo = async (urlToExtract = null) => {
    const targetUrl = urlToExtract || url
    if (!targetUrl.trim()) {
      toast.error('Please enter a business URL')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/extract-business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl.trim() }),
      })

      if (!res.ok) throw new Error('Failed to extract info')

      const data = await res.json()
      setContext(data)
      if (!flow.businessContext) {
        setPhase('edit')
      }
      toast.success('Business info extracted!')
    } catch (e) {
      toast.error(e.message || 'Failed to extract business information')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveContext = async () => {
    try {
      await onUpdate({ businessContext: context })
      setPhase('view')
      toast.success('Configuration saved!')
    } catch (e) {
      toast.error('Failed to save configuration')
    }
  }

  const handleFieldChange = (field, value) => {
    setContext((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  if (phase === 'url') {
    return (
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            Business Configuration
          </h2>
          <p className="text-slate-600 dark:text-slate-400">
            Enter your business URL so we can extract your company information.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Business Website URL
            </label>
            <Input
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && extractBusinessInfo()}
              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
            <p className="text-xs text-slate-500 mt-1">
              We'll analyze your website to extract business details
            </p>
          </div>

          <Button
            onClick={() => extractBusinessInfo()}
            disabled={loading || !url.trim()}
            className="w-full bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg h-10 font-medium disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Business'
            )}
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'edit' && context) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50 mb-2">
            Review & Edit Business Info
          </h2>
        </div>

        {/* URL Re-extract Section */}
        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg bg-slate-50 dark:bg-slate-900">
          <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-3">
            Not accurate? Try extracting again with a different URL
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://example.com"
              defaultValue={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-sm"
            />
            <Button
              onClick={() => extractBusinessInfo(url)}
              disabled={loading || !url.trim()}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-4 h-10 font-medium text-sm"
            >
              {loading ? (
                <Loader className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <RotateCw className="w-4 h-4 mr-2" />
                  Re-extract
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Business Name
            </label>
            <Input
              value={context.name || ''}
              onChange={(e) => handleFieldChange('name', e.target.value)}
              className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Target Audience
            </label>
            <textarea
              value={context.targetAudience || ''}
              onChange={(e) => handleFieldChange('targetAudience', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Comprehensive description of who they serve..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
              Services
            </label>
            <textarea
              value={context.services || ''}
              onChange={(e) => handleFieldChange('services', e.target.value)}
              rows={4}
              className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
              placeholder="Detailed list of main services and offerings..."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-900 dark:text-slate-50 mb-2">
            About the Business
          </label>
          <textarea
            value={context.about || ''}
            onChange={(e) => handleFieldChange('about', e.target.value)}
            rows={4}
            className="w-full px-3 py-2 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-400"
          />
        </div>

        <div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-50 mb-4">
            Design System
          </h3>

          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-medium text-slate-900 dark:text-slate-50 mb-3">
                Colors
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {['primary', 'secondary', 'accent', 'background'].map((colorName) => (
                  <div key={colorName}>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 capitalize">
                      {colorName}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={context.designSystem?.colors?.[colorName] || '#000000'}
                        onChange={(e) => {
                          setContext((prev) => ({
                            ...prev,
                            designSystem: {
                              ...prev.designSystem,
                              colors: {
                                ...prev.designSystem?.colors,
                                [colorName]: e.target.value,
                              },
                            },
                          }))
                        }}
                        className="w-10 h-10 border border-slate-200 dark:border-slate-800 rounded cursor-pointer"
                      />
                      <Input
                        value={context.designSystem?.colors?.[colorName] || '#000000'}
                        onChange={(e) => {
                          setContext((prev) => ({
                            ...prev,
                            designSystem: {
                              ...prev.designSystem,
                              colors: {
                                ...prev.designSystem?.colors,
                                [colorName]: e.target.value,
                              },
                            },
                          }))
                        }}
                        className="flex-1 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="text-xs font-medium text-slate-900 dark:text-slate-50 mb-3">
                Fonts
              </h4>
              <div className="grid grid-cols-2 gap-4">
                {['heading', 'body'].map((fontName) => (
                  <div key={fontName}>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-2 capitalize">
                      {fontName}
                    </label>
                    <Input
                      value={context.designSystem?.fonts?.[fontName] || 'Arial'}
                      onChange={(e) => {
                        setContext((prev) => ({
                          ...prev,
                          designSystem: {
                            ...prev.designSystem,
                            fonts: {
                              ...prev.designSystem?.fonts,
                              [fontName]: e.target.value,
                            },
                          },
                        }))
                      }}
                      placeholder="e.g., Arial, Georgia"
                      className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-8 border-t border-slate-200 dark:border-slate-800">
          <Button
            onClick={() => {
              setPhase('url')
              setUrl('')
            }}
            variant="outline"
            className="px-6 h-10"
          >
            Back
          </Button>
          <Button
            onClick={handleSaveContext}
            className="flex-1 bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg h-10 font-medium"
          >
            Save Configuration
          </Button>
        </div>
      </div>
    )
  }

  if (phase === 'view' && context) {
    return (
      <div className="space-y-8">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-slate-50">
            Business Configuration
          </h2>
          <Button
            onClick={() => setPhase('edit')}
            className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-4 h-9 text-sm font-medium"
          >
            Edit
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-6">
          <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
              Business Name
            </h3>
            <p className="text-lg font-semibold text-slate-900 dark:text-slate-50">
              {context.name}
            </p>
          </div>

          <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-3">
              Target Audience
            </h3>
            <p className="text-slate-900 dark:text-slate-50 leading-relaxed whitespace-pre-wrap">
              {context.targetAudience}
            </p>
          </div>

          <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-3">
              Services
            </h3>
            <p className="text-slate-900 dark:text-slate-50 leading-relaxed whitespace-pre-wrap">
              {context.services}
            </p>
          </div>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-2">
            About
          </h3>
          <p className="text-slate-900 dark:text-slate-50 leading-relaxed">{context.about}</p>
        </div>

        <div className="p-4 border border-slate-200 dark:border-slate-800 rounded-lg">
          <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase mb-4">
            Design System
          </h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">Colors</p>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(context.designSystem?.colors || {}).map(([name, color]) => (
                  <div key={name} className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded border border-slate-300 dark:border-slate-700"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-xs text-slate-600 dark:text-slate-400 capitalize">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">Fonts</p>
              <div className="space-y-2">
                {Object.entries(context.designSystem?.fonts || {}).map(([name, font]) => (
                  <div key={name}>
                    <p className="text-xs text-slate-600 dark:text-slate-400 capitalize mb-1">
                      {name}
                    </p>
                    <p
                      className="text-sm text-slate-900 dark:text-slate-50"
                      style={{ fontFamily: font }}
                    >
                      {font}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return null
}
