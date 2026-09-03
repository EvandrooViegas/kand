'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2, Sparkles, Globe, Palette, Type,
  Image as ImageIcon, Save, Plus, X, Check, Copy,
  ChevronDown, ChevronUp, Pencil,
} from 'lucide-react'

// ─── tiny helpers ─────────────────────────────────────────────────────────────

function normalizeFontName(name) {
  if (!name) return ''
  return name
    .replace(/-?(Thin|ExtraLight|Light|Regular|Medium|SemiBold|Bold|ExtraBold|Black)/gi, '')
    .replace(/-?(Italic|Oblique)/gi, '')
    .trim()
}

// ─── BrandInfoPanel ───────────────────────────────────────────────────────────
/**
 * Compact sidebar version of BrandInfo.
 * Props:
 *   flowId         – UUID of the currently selected flow
 *   flows          – full flows array (for auto-create guard)
 *   onFlowCreated  – called with the new/updated flow object after save
 */
export default function BrandInfoPanel({ flowId, flows = [], onFlowCreated }) {
  // ── URL extraction ─────────────────────────────────────────────────────────
  const [url, setUrl]           = useState('')
  const [extracting, setExtracting] = useState(false)

  // ── brand data ─────────────────────────────────────────────────────────────
  const [data, setData]         = useState(null)   // null = no data yet

  // ── font loading ───────────────────────────────────────────────────────────
  const [loadedFonts, setLoadedFonts]       = useState(new Set())
  const [fontErrors, setFontErrors]         = useState(new Set())

  // ── save ───────────────────────────────────────────────────────────────────
  const [saving, setSaving]     = useState(false)

  // ── section collapse ───────────────────────────────────────────────────────
  const [showColors, setShowColors] = useState(true)
  const [showFonts,  setShowFonts]  = useState(true)
  const [showEdit,   setShowEdit]   = useState(false)   // editable text fields

  // ── load persisted brand context when the selected flow changes ────────────
  useEffect(() => {
    if (!flowId) { setData(null); return }
    fetch(`/api/flows/${flowId}`)
      .then(r => r.json())
      .then(flow => {
        const bc = flow?.brandContext
        if (bc && (bc.name || bc.about)) {
          setData({
            name:     bc.name     || '',
            about:    bc.about    || '',
            logo:     bc.logo     || '',
            language: bc.language || '',
            colors:   bc.colors   || [],
            fonts:    bc.fonts    || [],
          })
        } else {
          setData(null)
        }
      })
      .catch(() => {})
  }, [flowId])

  // ── load Google fonts when font list changes ───────────────────────────────
  useEffect(() => {
    data?.fonts?.forEach(f => loadGoogleFont(f))
  }, [data?.fonts?.length]) // eslint-disable-line react-hooks/exhaustive-deps

  function loadGoogleFont(fontName) {
    const n = normalizeFontName(fontName)
    if (!n || loadedFonts.has(n) || fontErrors.has(n)) return
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = `https://fonts.googleapis.com/css2?family=${n.replace(/ /g, '+')}:wght@300;400;500;600;700&display=swap`
    const tid = setTimeout(() => setLoadedFonts(p => new Set([...p, n])), 2000)
    link.onload  = () => { clearTimeout(tid); setLoadedFonts(p => new Set([...p, n])) }
    link.onerror = () => { clearTimeout(tid); setFontErrors(p => new Set([...p, n])); setLoadedFonts(p => new Set([...p, n])) }
    document.head.appendChild(link)
  }

  // ── extract ────────────────────────────────────────────────────────────────
  const handleExtract = async () => {
    if (!url.trim()) { toast.error('Enter a URL first'); return }
    setExtracting(true)
    try {
      const res = await fetch('/api/extract-business-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      })
      if (!res.ok) {
        const e = await res.json()
        throw new Error(e.error || 'Extraction failed')
      }
      const d = await res.json()
      setData({
        name:     d.name                  || '',
        about:    d.about                 || '',
        logo:     d.logo                  || '',
        language: d.language              || '',
        colors:   d.designSystem?.colors  || [],
        fonts:    d.designSystem?.fonts   || [],
      })
      toast.success('Brand extracted — review and save')
    } catch (err) {
      toast.error(err.message || 'Extraction failed')
    } finally {
      setExtracting(false)
    }
  }

  // ── field helpers ──────────────────────────────────────────────────────────
  const set = (field, value) => setData(prev => ({ ...prev, [field]: value }))

  const setColor = (i, v) => {
    const next = [...data.colors]; next[i] = v
    setData(prev => ({ ...prev, colors: next }))
  }
  const addColor    = () => setData(prev => ({ ...prev, colors: [...prev.colors, '#000000'] }))
  const removeColor = i  => setData(prev => ({ ...prev, colors: prev.colors.filter((_, j) => j !== i) }))

  const setFont  = (i, v) => {
    const next = [...data.fonts]; next[i] = v
    setData(prev => ({ ...prev, fonts: next }))
    if (v) loadGoogleFont(v)
  }
  const addFont    = () => setData(prev => ({ ...prev, fonts: [...prev.fonts, ''] }))
  const removeFont = i  => setData(prev => ({ ...prev, fonts: prev.fonts.filter((_, j) => j !== i) }))

  const copyHex = (hex) => { navigator.clipboard.writeText(hex); toast.success(`Copied ${hex}`) }

  // ── save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    try {
      let targetId = flowId

      if (!targetId) {
        const res = await fetch('/api/flows', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: data.name ? `${data.name} Flow` : `Flow ${Date.now()}` }),
        })
        if (!res.ok) throw new Error('Failed to create flow')
        const nf = await res.json()
        targetId = nf.id
        onFlowCreated?.(nf)
      }

      const res = await fetch(`/api/flows/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brandContext: {
            name:     data.name,
            about:    data.about,
            logo:     data.logo,
            language: data.language,
            colors:   data.colors,
            fonts:    data.fonts,
          },
          ...(data.name ? { name: data.name } : {}),
        }),
      })
      if (!res.ok) throw new Error('Failed to save')
      const updated = await res.json()
      onFlowCreated?.(updated)
      toast.success('Brand saved')
    } catch (err) {
      toast.error(err.message || 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ── */}
      <div className="flex-shrink-0 px-4 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-400 mb-3">Brand</p>

        {/* URL extractor */}
        <div className="flex gap-1.5">
          <Input
            type="url"
            placeholder="https://example.com"
            value={url}
            onChange={e => setUrl(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !extracting && handleExtract()}
            disabled={extracting}
            className="h-8 text-xs flex-1 min-w-0"
          />
          <Button
            onClick={handleExtract}
            disabled={extracting}
            size="sm"
            className="h-8 px-2 flex-shrink-0"
            title="Extract brand from URL"
          >
            {extracting
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Sparkles className="w-3.5 h-3.5" />}
          </Button>
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">

        {!data ? (
          /* empty state */
          <div className="flex flex-col items-center justify-center gap-3 py-12 px-5 text-center">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Globe className="w-6 h-6 text-primary/60" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-400">No brand yet</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">
              Paste a website URL above and hit <Sparkles className="w-3 h-3 inline-block mx-0.5" /> to extract brand information automatically.
            </p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-5">

            {/* ── Identity block ── */}
            <div className="flex items-start gap-3">
              {/* logo */}
              <div className="w-12 h-12 rounded-xl border-2 border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                {data.logo
                  ? <img src={data.logo} alt="" className="w-full h-full object-contain p-1" />
                  : <ImageIcon className="w-5 h-5 text-slate-300" />}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm leading-tight truncate text-slate-900 dark:text-slate-100">
                  {data.name || 'Untitled Brand'}
                </p>
                {data.language && (
                  <Badge variant="secondary" className="mt-1 text-xs px-1.5 py-0">
                    {data.language.toUpperCase()}
                  </Badge>
                )}
              </div>

              {/* toggle editable fields */}
              <button
                onClick={() => setShowEdit(v => !v)}
                className="flex-shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Edit brand details"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* ── Editable text fields (collapsible) ── */}
            {showEdit && (
              <div className="space-y-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                <div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">Name</Label>
                  <Input
                    value={data.name}
                    onChange={e => set('name', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">About</Label>
                  <Textarea
                    value={data.about}
                    onChange={e => set('about', e.target.value)}
                    rows={3}
                    className="text-xs resize-none"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">Logo URL</Label>
                  <Input
                    value={data.logo}
                    onChange={e => set('logo', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">Language</Label>
                  <Input
                    value={data.language}
                    onChange={e => set('language', e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            )}

            {/* ── About snippet ── */}
            {!showEdit && data.about && (
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                {data.about}
              </p>
            )}

            {/* ── Colors ── */}
            <div>
              <button
                onClick={() => setShowColors(v => !v)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <div className="flex items-center gap-1.5">
                  <Palette className="w-3.5 h-3.5 text-purple-500" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Colors
                  </span>
                  <span className="text-xs text-slate-400">({data.colors.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); addColor() }}
                    className="p-0.5 rounded text-slate-400 hover:text-primary transition-colors"
                    title="Add color"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  {showColors
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </div>
              </button>

              {showColors && (
                <div className="space-y-1.5">
                  {data.colors.length === 0 ? (
                    <button
                      onClick={addColor}
                      className="w-full h-9 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400 hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add color
                    </button>
                  ) : (
                    <>
                      {/* swatch row */}
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {data.colors.map((c, i) => (
                          <button
                            key={i}
                            title={c}
                            onClick={() => copyHex(c)}
                            className="w-7 h-7 rounded-lg border-2 border-white dark:border-slate-800 shadow-sm hover:scale-110 transition-transform"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                      </div>

                      {/* editable rows */}
                      {data.colors.map((c, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            type="color"
                            value={c}
                            onChange={e => setColor(i, e.target.value)}
                            className="w-7 h-7 rounded-md border border-slate-200 cursor-pointer flex-shrink-0 p-0.5"
                          />
                          <Input
                            value={c}
                            onChange={e => setColor(i, e.target.value)}
                            className="h-7 text-xs font-mono flex-1 min-w-0"
                          />
                          <button
                            onClick={() => copyHex(c)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors flex-shrink-0"
                          >
                            <Copy className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => removeColor(i)}
                            className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* ── Fonts ── */}
            <div>
              <button
                onClick={() => setShowFonts(v => !v)}
                className="w-full flex items-center justify-between mb-2 group"
              >
                <div className="flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                    Fonts
                  </span>
                  <span className="text-xs text-slate-400">({data.fonts.length})</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); addFont() }}
                    className="p-0.5 rounded text-slate-400 hover:text-primary transition-colors"
                    title="Add font"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                  {showFonts
                    ? <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                    : <ChevronDown className="w-3.5 h-3.5 text-slate-400" />}
                </div>
              </button>

              {showFonts && (
                <div className="space-y-2">
                  {data.fonts.length === 0 ? (
                    <button
                      onClick={addFont}
                      className="w-full h-9 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400 hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3 h-3" /> Add font
                    </button>
                  ) : (
                    data.fonts.map((font, i) => {
                      const nf       = normalizeFontName(font)
                      const loaded   = loadedFonts.has(nf)
                      const errored  = fontErrors.has(nf)
                      return (
                        <div key={i} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Input
                              value={font}
                              onChange={e => setFont(i, e.target.value)}
                              placeholder="Inter, Roboto…"
                              className="h-7 text-xs flex-1 min-w-0"
                            />
                            {font && (
                              <Badge
                                variant={errored ? 'destructive' : loaded ? 'default' : 'secondary'}
                                className="text-xs px-1.5 py-0 flex-shrink-0"
                              >
                                {errored ? '✗' : loaded ? '✓' : '…'}
                              </Badge>
                            )}
                            <button
                              onClick={() => removeFont(i)}
                              className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors flex-shrink-0"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                          {/* mini preview */}
                          {nf && loaded && !errored && (
                            <p
                              className="text-sm text-slate-700 dark:text-slate-300 truncate px-1"
                              style={{ fontFamily: `"${nf}", sans-serif` }}
                            >
                              {nf}
                            </p>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Sticky save footer ── */}
      {data && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-950">
          <Button
            onClick={handleSave}
            disabled={saving}
            size="sm"
            className="w-full h-8"
          >
            {saving
              ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Saving…</>
              : <><Save className="w-3.5 h-3.5 mr-1.5" />Save brand</>}
          </Button>
        </div>
      )}
    </div>
  )
}
