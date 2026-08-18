'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, Pencil, Copy, Moon, Sun, ArrowUpRight, ArrowRight, Upload, Download, Layers, Image as ImageIcon, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { KandLogo, KandMark } from '@/components/logo'
import { CanvasPreview } from '@/components/CanvasPreview'

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <button className="p-2 rounded-lg transition"><Sun className="w-5 h-5" /></button>
  return (
    <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="text-center py-16">
      <div className="w-14 h-14 mx-auto mb-5 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-400">
        <ImageIcon className="w-7 h-7" />
      </div>
      <h3 className="text-xl font-semibold mb-1 text-slate-900 dark:text-slate-50">No designs yet</h3>
      <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 max-w-xs mx-auto">
        Start fresh by creating your first canvas
      </p>
      <Button onClick={onNew} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 text-white dark:text-slate-900 rounded-lg px-5 h-9 font-medium">
        <Plus className="w-4 h-4 mr-2" />New design
      </Button>
    </div>
  )
}

function Dashboard() {
  const router = useRouter()
  const [canvases, setCanvases] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [canvasType, setCanvasType] = useState('single')
  const [importing, setImporting] = useState(false)
  const importFileRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/canvases')
      const data = await res.json()
      setCanvases(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Failed to load')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const createCanvas = async () => {
    const res = await fetch('/api/canvases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name || 'Untitled', type: canvasType }),
    })
    const c = await res.json()
    setOpen(false); setName(''); setCanvasType('single')
    if (canvasType === 'carousel') router.push(`/carousel/${c.id}`)
    else router.push(`/editor/${c.id}`)
  }

  const importCanvas = async (file) => {
    if (!file) return
    setImporting(true)
    try {
      const text = await file.text()
      const config = JSON.parse(text)
      const { id: _id, _id: __id, createdAt, updatedAt, ...data } = config
      if (!data.name) data.name = file.name.replace(/\.kand\.json$/i, '').replace(/-/g, ' ') || 'Imported Canvas'
      const createRes = await fetch('/api/canvases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: data.name, width: data.width, height: data.height, background: data.background }),
      })
      const newCanvas = await createRes.json()
      if (!newCanvas.id) throw new Error('Failed to create canvas')
      await fetch(`/api/canvases/${newCanvas.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, id: newCanvas.id }),
      })
      toast.success('Canvas imported')
      router.push(`/editor/${newCanvas.id}`)
    } catch (e) {
      toast.error('Import failed: ' + (e.message || 'Invalid file'))
    } finally {
      setImporting(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const exportCanvas = (canvas) => {
    const { _id, createdAt, updatedAt, ...exportData } = canvas
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${(canvas.name || 'canvas').replace(/[^a-z0-9]/gi, '-').toLowerCase()}.kand.json`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Exported')
  }

  const deleteCanvas = async (id) => {
    if (!confirm('Delete this design?')) return
    await fetch(`/api/canvases/${id}`, { method: 'DELETE' })
    toast.success('Deleted'); load()
  }
  
  const duplicateCanvas = async (id) => {
    const res = await fetch(`/api/canvases/${id}/duplicate`, { method: 'POST' })
    if (res.ok) { toast.success('Duplicated'); load() } else toast.error('Failed')
  }

  const totalNodes = canvases.reduce((acc, c) => acc + (c.nodes?.length || 0), 0)

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
          <KandLogo size={32} showWord={true} />
          <div className="flex items-center gap-4">
            <nav className="hidden md:flex gap-7 text-sm font-medium">
              <a href="#api-docs" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">Docs</a>
              <button onClick={() => router.push('/renders')} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">Renders</button>
              <button onClick={() => router.push('/flow')} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">Flow</button>
              <button onClick={() => router.push('/case-studies')} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">Case Studies</button>
            </nav>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <input ref={importFileRef} type="file" accept=".json,.kand.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importCanvas(f) }} />
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex text-slate-600 dark:text-slate-400" onClick={() => importFileRef.current?.click()} disabled={importing}>
                <Upload className="w-4 h-4 mr-1.5" />{importing ? 'Importing…' : 'Import'}
              </Button>
              <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setName(''); setCanvasType('single') } }}>
                <DialogTrigger asChild>
                  <Button className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-4 h-9 font-medium">
                    <Plus className="w-4 h-4 mr-1.5" />New
                  </Button>
                </DialogTrigger>
                <DialogContent className="rounded-xl border-slate-200 dark:border-slate-800">
                  <DialogHeader><DialogTitle>Create new design</DialogTitle></DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-3">
                      <button type="button" onClick={() => setCanvasType('single')} className={`p-3 rounded-lg border-2 transition ${canvasType === 'single' ? 'border-slate-900 dark:border-slate-50 bg-slate-50 dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                        <ImageIcon className="w-5 h-5 mx-auto mb-2" />
                        <div className="text-sm font-medium">Single</div>
                      </button>
                      <button type="button" onClick={() => setCanvasType('carousel')} className={`p-3 rounded-lg border-2 transition ${canvasType === 'carousel' ? 'border-slate-900 dark:border-slate-50 bg-slate-50 dark:bg-slate-900' : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'}`}>
                        <Layers className="w-5 h-5 mx-auto mb-2" />
                        <div className="text-sm font-medium">Carousel</div>
                      </button>
                    </div>
                    <Input placeholder="Design name" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && createCanvas()} className="rounded-lg" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                    <Button onClick={createCanvas} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white">Create</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="mb-20 max-w-3xl">
          <div className="inline-flex items-center gap-2 mb-5 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
            <Sparkles className="w-3 h-3" />
            xavi.ia — The programmable canvas
          </div>
          <h1 className="text-5xl md:text-6xl font-bold mb-5 text-slate-900 dark:text-slate-50 leading-tight">
            Design<br />templates once.<br />Render infinitely.
          </h1>
          <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed max-w-2xl">
            Tag layers as dynamic and generate unlimited variations with a single API call. Build once, scale forever.
          </p>
          <div className="flex gap-3 flex-wrap">
            <Button onClick={() => setOpen(true)} className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-6 h-11 font-medium">
              <Plus className="w-5 h-5 mr-2" />Start designing
            </Button>
            <Button onClick={() => router.push('/renders')} variant="outline" className="rounded-lg px-6 h-11 font-medium border-slate-200 dark:border-slate-800">
              View renders
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3 mb-20 py-8 border-t border-b border-slate-200 dark:border-slate-800">
          {[
            { label: 'Designs', value: canvases.length.toString().padStart(2, '0') },
            { label: 'Layers', value: totalNodes.toString().padStart(2, '0') },
            { label: 'Status', value: 'Ready' },
            { label: 'Mode', value: 'Active' },
          ].map((stat, i) => (
            <div key={i}>
              <div className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-50">{stat.value}</div>
              <div className="text-xs font-medium text-slate-500 dark:text-slate-500 uppercase tracking-wider mt-1">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Canvas Grid */}
        <div>
          <h2 className="text-2xl font-bold mb-8 text-slate-900 dark:text-slate-50">Your Studio</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => <div key={i} className="aspect-square bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />)}
            </div>
          ) : canvases.length === 0 ? (
            <div className="rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 p-12">
              <EmptyState onNew={() => setOpen(true)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {canvases.map((c) => (
                <div key={c.id} className="group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md transition-all duration-200">
                  <div className="aspect-square bg-slate-50 dark:bg-slate-900 relative overflow-hidden cursor-pointer" onClick={() => router.push(c.type === 'carousel' ? `/carousel/${c.id}` : `/editor/${c.id}`)}>
                    <CanvasPreview canvas={c} />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors" />
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-900">
                    <h3 className="font-semibold mb-1 truncate text-slate-900 dark:text-slate-50">{c.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-500 mb-4">
                      {(c.nodes || []).length} layers · {new Date(c.updatedAt).toLocaleDateString('en', { day: 'numeric', month: 'short' })}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="ghost" className="flex-1 h-8 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => router.push(c.type === 'carousel' ? `/carousel/${c.id}` : `/editor/${c.id}`)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => duplicateCanvas(c.id)}>
                        <Copy className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 rounded-md text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => exportCanvas(c)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 rounded-md text-slate-600 dark:text-slate-400 hover:bg-red-100 dark:hover:bg-red-950 hover:text-red-700" onClick={() => deleteCanvas(c.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer id="api-docs" className="border-t border-slate-200 dark:border-slate-800 mt-20 py-12 px-6 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-6xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 mb-8">
            <div>
              <KandLogo size={28} />
              <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
                The programmable canvas for infinite design variations.
              </p>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-4 text-slate-900 dark:text-slate-50">Resources</h3>
              <ul className="space-y-3 text-sm">
                <li><a href="#" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">Documentation</a></li>
                <li><a href="#" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">API Reference</a></li>
                <li><a href="#" className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition">GitHub</a></li>
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-4 text-slate-900 dark:text-slate-50">Quick Start</h3>
              <pre className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-3 rounded-lg text-xs overflow-x-auto text-slate-800 dark:text-slate-200 font-mono">
{`POST /api/render
{ "canvas_id": "..." }`}
              </pre>
            </div>
          </div>
          <div className="border-t border-slate-200 dark:border-slate-800 pt-8 text-center text-xs text-slate-500 dark:text-slate-500">
            © 2024 xavi.ia — Built with intention
          </div>
        </div>
      </footer>
    </div>
  )
}

export default Dashboard
