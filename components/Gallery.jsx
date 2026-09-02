'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { toast } from 'sonner'
import {
  Upload, Trash2, Loader2, ImageIcon, RefreshCw,
  Tag, Eye, Users, MapPin, Zap, Palette, AlertCircle,
  CheckCircle2, Clock, X, Search, ChevronDown, ChevronUp
} from 'lucide-react'

// ─── helpers ──────────────────────────────────────────────────────────────────

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = e => resolve(e.target.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function formatBytes(w, h) {
  if (!w || !h) return ''
  return `${w} × ${h}`
}

// ─── StatusBadge ──────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  if (status === 'ready') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" />Ready
    </span>
  )
  if (status === 'processing') return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-500 dark:text-amber-400">
      <Loader2 className="w-3 h-3 animate-spin" />Analysing
    </span>
  )
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 dark:text-red-400">
      <AlertCircle className="w-3 h-3" />Failed
    </span>
  )
}

// ─── AssetDetail ─────────────────────────────────────────────────────────────

function AssetDetail({ asset, onClose, onDelete }) {
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await onDelete(asset.id)
      onClose()
    } finally {
      setDeleting(false)
    }
  }

  const rows = [
    { icon: ImageIcon, label: 'Type',        value: asset.asset_type },
    { icon: MapPin,    label: 'Environment', value: asset.environment },
    { icon: Zap,       label: 'Activity',    value: asset.activity },
    { icon: Palette,   label: 'Style',       value: asset.style },
    { icon: Users,     label: 'Has people',  value: asset.has_people != null ? (asset.has_people ? 'Yes' : 'No') : null },
    { icon: Eye,       label: 'Orientation', value: asset.orientation },
    { icon: ImageIcon, label: 'Dimensions',  value: formatBytes(asset.width, asset.height) },
  ].filter(r => r.value)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 truncate">{asset.filename}</p>
            <StatusBadge status={asset.status} />
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Image */}
        <div className="px-6 pt-5">
          <div className="rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center max-h-72">
            <img src={asset.url} alt={asset.description || asset.filename}
              className="max-w-full max-h-72 object-contain" />
          </div>
        </div>

        {/* Description */}
        {asset.description && (
          <div className="px-6 pt-5">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Description</p>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">{asset.description}</p>
          </div>
        )}

        {/* Metadata rows */}
        {rows.length > 0 && (
          <div className="px-6 pt-4 grid grid-cols-2 gap-3">
            {rows.map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-start gap-2">
                <Icon className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                  <p className="text-sm text-slate-700 dark:text-slate-300 capitalize">{value}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tags */}
        {asset.tags?.length > 0 && (
          <div className="px-6 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />Tags
            </p>
            <div className="flex flex-wrap gap-2">
              {asset.tags.map(tag => (
                <span key={tag} className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-md font-medium">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Objects */}
        {asset.objects?.length > 0 && (
          <div className="px-6 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Objects detected</p>
            <div className="flex flex-wrap gap-2">
              {asset.objects.map(obj => (
                <span key={obj} className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-1 rounded-md">
                  {obj}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-5 mt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <p className="text-xs text-slate-400">
            {new Date(asset.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
          </p>
          <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
            {deleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}

// ─── AssetCard ────────────────────────────────────────────────────────────────

function AssetCard({ asset, onClick }) {
  return (
    <button onClick={onClick}
      className="group relative rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border-2 border-transparent hover:border-primary transition-all aspect-square focus:outline-none focus:border-primary">
      <img
        src={asset.thumbnail_url || asset.url}
        alt={asset.description || asset.filename}
        className="w-full h-full object-cover"
      />

      {/* Status overlay for processing/failed */}
      {asset.status !== 'ready' && (
        <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-1">
          {asset.status === 'processing'
            ? <Loader2 className="w-6 h-6 text-white animate-spin" />
            : <AlertCircle className="w-6 h-6 text-red-400" />}
          <span className="text-white text-xs font-medium capitalize">{asset.status}</span>
        </div>
      )}

      {/* Hover overlay */}
      {asset.status === 'ready' && (
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex flex-col justify-end p-3 opacity-0 group-hover:opacity-100">
          <p className="text-white text-xs font-medium line-clamp-2 leading-snug">{asset.description || asset.filename}</p>
          {asset.tags?.length > 0 && (
            <p className="text-white/70 text-xs mt-1 line-clamp-1">
              {asset.tags.slice(0, 3).join(' · ')}
            </p>
          )}
        </div>
      )}
    </button>
  )
}

// ─── UploadZone ───────────────────────────────────────────────────────────────

function UploadZone({ onFiles, uploading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handle = files => {
    const valid = [...files].filter(f => f.type.startsWith('image/'))
    if (valid.length === 0) { toast.error('Please select image files'); return }
    onFiles(valid)
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center py-10 px-6 text-center
        ${dragging ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700 hover:border-primary/60 hover:bg-primary/5'}`}
      onClick={() => !uploading && inputRef.current?.click()}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); handle(e.dataTransfer.files) }}
    >
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={e => handle(e.target.files)} disabled={uploading} />

      {uploading ? (
        <>
          <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
          <p className="font-semibold text-slate-700 dark:text-slate-300">Uploading…</p>
          <p className="text-sm text-slate-500 mt-1">AI analysis will run in the background</p>
        </>
      ) : (
        <>
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Upload className="w-7 h-7 text-primary" />
          </div>
          <p className="font-semibold text-slate-700 dark:text-slate-300">Drop images here or click to browse</p>
          <p className="text-sm text-slate-500 mt-1">PNG, JPG, WEBP · Up to 10 MB each · Multiple files supported</p>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Gallery({ flowId, brandContext }) {
  const brandId = flowId ? `brand_${flowId}` : null

  const [assets, setAssets]           = useState([])
  const [loading, setLoading]         = useState(true)
  const [uploading, setUploading]     = useState(false)
  const [selectedAsset, setSelectedAsset] = useState(null)
  const [search, setSearch]           = useState('')
  const [pollingIds, setPollingIds]   = useState(new Set())

  // ── load ─────────────────────────────────────────────────────────────────────

  const loadAssets = useCallback(async () => {
    if (!brandId) { setLoading(false); return }
    try {
      const res = await fetch(`/api/assets?brand_id=${encodeURIComponent(brandId)}`)
      const data = await res.json()
      setAssets(Array.isArray(data) ? data : [])
    } catch {
      toast.error('Failed to load gallery')
    } finally {
      setLoading(false)
    }
  }, [brandId])

  useEffect(() => { loadAssets() }, [loadAssets])

  // ── poll processing assets ────────────────────────────────────────────────────
  // Local model loading can take several minutes on first run —
  // use a 15s interval instead of 4s to avoid hammering the server.
  // Give up polling after 20 minutes (80 attempts × 15s).

  useEffect(() => {
    const processingIds = assets.filter(a => a.status === 'processing').map(a => a.id)
    if (processingIds.length === 0) return

    let attempts = 0
    const MAX_ATTEMPTS = 80  // 80 × 15s = 20 minutes

    const interval = setInterval(async () => {
      attempts++
      const updated = await Promise.all(
        processingIds.map(id =>
          fetch(`/api/assets/${id}`).then(r => r.json()).catch(() => null)
        )
      )
      setAssets(prev => {
        let changed = false
        const next = prev.map(a => {
          const u = updated.find(u => u?.id === a.id)
          if (u && u.status !== a.status) { changed = true; return u }
          return a
        })
        return changed ? next : prev
      })
      const stillProcessing = updated.some(u => u?.status === 'processing')
      if (!stillProcessing || attempts >= MAX_ATTEMPTS) clearInterval(interval)
    }, 15000)

    return () => clearInterval(interval)
  }, [assets.map(a => a.id + a.status).join(',')])

  // ── upload ────────────────────────────────────────────────────────────────────

  const handleFiles = async (files) => {
    if (!brandId) { toast.error('No brand selected'); return }
    setUploading(true)
    let successCount = 0

    for (const file of files) {
      try {
        const dataUrl = await fileToDataUrl(file)
        const res = await fetch('/api/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: dataUrl,
            filename: file.name,
            brand_id: brandId,
          }),
        })
        const asset = await res.json()
        if (!res.ok) throw new Error(asset.error || 'Upload failed')
        setAssets(prev => [asset, ...prev])
        successCount++
      } catch (err) {
        toast.error(`${file.name}: ${err.message}`)
      }
    }

    setUploading(false)
    if (successCount > 0) {
      toast.success(`${successCount} image${successCount > 1 ? 's' : ''} uploaded — AI analysis running in background`)
    }
  }

  // ── delete ────────────────────────────────────────────────────────────────────

  const handleDelete = async (id) => {
    try {
      await fetch(`/api/assets/${id}`, { method: 'DELETE' })
      setAssets(prev => prev.filter(a => a.id !== id))
      toast.success('Asset deleted')
    } catch {
      toast.error('Failed to delete asset')
    }
  }

  // ── filter ────────────────────────────────────────────────────────────────────

  const filtered = assets.filter(a => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      a.filename?.toLowerCase().includes(q) ||
      a.description?.toLowerCase().includes(q) ||
      a.tags?.some(t => t.toLowerCase().includes(q)) ||
      a.objects?.some(o => o.toLowerCase().includes(q)) ||
      a.environment?.toLowerCase().includes(q) ||
      a.activity?.toLowerCase().includes(q) ||
      a.asset_type?.toLowerCase().includes(q)
    )
  })

  const processingCount = assets.filter(a => a.status === 'processing').length

  // ─────────────────────────────────────────────────────────────────────────────

  if (!brandId) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <ImageIcon className="w-8 h-8 text-slate-400" />
        </div>
        <p className="font-semibold text-slate-700 dark:text-slate-300">No brand selected</p>
        <p className="text-sm text-slate-500 mt-1">Save brand information first to use the gallery</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Upload zone */}
      <UploadZone onFiles={handleFiles} uploading={uploading} />

      {/* Toolbar */}
      {assets.length > 0 && (
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by tag, description, object…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={loadAssets}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          <div className="text-sm text-slate-500 whitespace-nowrap">
            {filtered.length} / {assets.length} asset{assets.length !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Processing notice */}
      {processingCount > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <Loader2 className="w-4 h-4 text-amber-500 animate-spin flex-shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">
            <strong>{processingCount}</strong> image{processingCount > 1 ? 's' : ''} being analysed — the local AI model may take a few minutes on first run. This page updates automatically every 15s.
          </p>
        </div>
      )}

      {/* Empty */}
      {!loading && assets.length === 0 && (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
            <ImageIcon className="w-8 h-8 text-slate-300" />
          </div>
          <p className="font-semibold text-slate-500">No images yet</p>
          <p className="text-sm text-slate-400 mt-1">Upload images above to build your brand asset library</p>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {filtered.map(asset => (
            <AssetCard key={asset.id} asset={asset} onClick={() => setSelectedAsset(asset)} />
          ))}
        </div>
      )}

      {/* No results */}
      {!loading && assets.length > 0 && filtered.length === 0 && (
        <div className="text-center py-12">
          <p className="text-slate-500 text-sm">No assets match "<strong>{search}</strong>"</p>
          <button onClick={() => setSearch('')} className="text-primary text-sm hover:underline mt-1">Clear search</button>
        </div>
      )}

      {/* Detail modal */}
      {selectedAsset && (
        <AssetDetail
          asset={selectedAsset}
          onClose={() => setSelectedAsset(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  )
}
