'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  CheckCircle, Trash2, Moon, Sun, ArrowLeft, ExternalLink, Download,
  Clock, CheckCheck, ImageIcon, Layers, Eye, RotateCcw, Copy, Check
} from 'lucide-react'
import { toast } from 'sonner'
import { KandLogo } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }

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

function RenderCard({ render, onApprove, onDelete, baseUrl }) {
  const [preview, setPreview] = useState(false)
  const [copied, setCopied] = useState(false)
  const url = render.type === 'carousel'
    ? `${baseUrl}/api/rendered/${render.id}.zip`
    : `${baseUrl}/api/rendered/${render.id}`

  const copyUrl = () => {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={`rounded-xl border-2 ${render.approved ? 'border-[#9AB800] bg-[#D4FF00]/5' : 'border-foreground/15 bg-card'} overflow-hidden transition-all`}>
      {/* Preview thumbnail for single renders */}
      {render.type === 'single' && (
        <div
          className="aspect-square bg-muted/40 relative cursor-pointer group overflow-hidden"
          onClick={() => setPreview(true)}
        >
          <img
            src={`/api/rendered/${render.id}`}
            alt="render"
            className="w-full h-full object-cover"
            onError={(e) => { e.target.style.display = 'none' }}
          />
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
            <Eye className="w-6 h-6 text-white" />
          </div>
        </div>
      )}
      {render.type === 'carousel' && (
        <div className="aspect-square bg-muted/40 flex flex-col items-center justify-center gap-2 text-muted-foreground">
          <Layers className="w-8 h-8" />
          <span className="text-xs font-medium">{render.pages?.length || 0} pages</span>
        </div>
      )}

      <div className="p-3 space-y-2.5">
        {/* Canvas name + type badge */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-bold truncate">{render.canvasId?.slice(0, 8)}…</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              {new Date(render.createdAt).toLocaleString('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className={`shrink-0 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
            render.type === 'carousel' ? 'border-indigo-400 text-indigo-400' : 'border-foreground/30 text-foreground/60'
          }`}>
            {render.type}
          </span>
        </div>

        {/* Payload preview */}
        {render.payload && (
          <details className="text-[10px] text-muted-foreground">
            <summary className="cursor-pointer select-none">Payload</summary>
            <pre className="mt-1 bg-muted/30 rounded p-2 overflow-x-auto max-h-24 text-[9px]">
              {JSON.stringify(render.payload, null, 1)}
            </pre>
          </details>
        )}

        {/* Carousel pages list */}
        {render.type === 'carousel' && render.pages && (
          <div className="space-y-0.5">
            {render.pages.map((p) => (
              <div key={p.pageId} className={`flex items-center gap-1.5 text-[10px] ${p.error ? 'text-destructive' : 'text-muted-foreground'}`}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.type === 'top_peer' ? '#D4FF00' : p.type === 'bottom_peer' ? '#9AB800' : '#6366f1' }} />
                {p.filename || p.error}
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-1 pt-1">
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-[#D4FF00] hover:text-foreground" onClick={copyUrl} title="Copy URL">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
          <a href={url} target="_blank" rel="noreferrer" download>
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-[#D4FF00] hover:text-foreground" title="Download">
              <Download className="w-3 h-3" />
            </Button>
          </a>
          {!render.approved && (
            <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => onApprove(render.id)} title="Approve">
              <CheckCircle className="w-3 h-3" />
            </Button>
          )}
          {render.approved && (
            <span className="flex items-center gap-1 text-[10px] text-[#9AB800] font-semibold ml-auto">
              <CheckCheck className="w-3 h-3" />Approved
            </span>
          )}
          <Button size="icon" variant="ghost" className="h-7 w-7 hover:bg-destructive hover:text-destructive-foreground ml-auto" onClick={() => onDelete(render.id)} title="Delete">
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Fullscreen preview dialog */}
      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>Render Preview</DialogTitle></DialogHeader>
          <img src={`/api/rendered/${render.id}`} alt="render" className="w-full rounded-lg" />
          <div className="flex gap-2 mt-2">
            <Button variant="outline" className="flex-1" onClick={copyUrl}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}Copy URL
            </Button>
            <a href={url} target="_blank" rel="noreferrer" className="flex-1">
              <Button variant="outline" className="w-full"><ExternalLink className="w-4 h-4 mr-2" />Open</Button>
            </a>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function RendersPage() {
  const router = useRouter()
  const [renders, setRenders] = useState([])
  const [loading, setLoading] = useState(true)
  const [baseUrl, setBaseUrl] = useState('')

  useEffect(() => {
    setBaseUrl(window.location.origin)
    load()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/renders')
      const data = await res.json()
      setRenders(Array.isArray(data) ? data : [])
    } catch (e) { toast.error('Failed to load renders') }
    finally { setLoading(false) }
  }

  const approve = async (id) => {
    await fetch(`/api/renders/${id}/approve`, { method: 'POST' })
    setRenders(prev => prev.map(r => r.id === id ? { ...r, approved: true } : r))
    toast.success('Approved')
  }

  const del = async (id) => {
    if (!confirm('Delete this render?')) return
    await fetch(`/api/renders/${id}`, { method: 'DELETE' })
    setRenders(prev => prev.filter(r => r.id !== id))
    toast.success('Deleted')
  }

  const all = renders
  const approved = renders.filter(r => r.approved)
  const pending = renders.filter(r => !r.approved)

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground">
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20">
        <div className="container max-w-7xl mx-auto py-3 flex items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ArrowLeft className="w-4 h-4" /></Button>
            <KandLogo size={28} />
            <span className="text-xl font-bold" style={BEBAS}>RENDERS</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={load} title="Refresh"><RotateCcw className="w-4 h-4" /></Button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Total', value: all.length, icon: ImageIcon },
            { label: 'Pending', value: pending.length, icon: Clock },
            { label: 'Approved', value: approved.length, icon: CheckCheck },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-xl border-2 border-foreground/15 bg-card p-4 flex items-center gap-3">
              <Icon className="w-5 h-5 text-muted-foreground" />
              <div>
                <p style={{ ...BEBAS, fontSize: 32, lineHeight: 1 }}>{value.toString().padStart(2, '0')}</p>
                <p className="text-[11px] uppercase tracking-widest text-foreground/60">{label}</p>
              </div>
            </div>
          ))}
        </div>

        <Tabs defaultValue="all">
          <TabsList className="border-2 border-foreground/20 bg-card mb-6">
            <TabsTrigger value="all" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground font-bold uppercase tracking-wider text-xs">
              All Renders ({all.length})
            </TabsTrigger>
            <TabsTrigger value="approved" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground font-bold uppercase tracking-wider text-xs">
              Approved ({approved.length})
            </TabsTrigger>
          </TabsList>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {[1,2,3,4,5,6].map(i => <div key={i} className="aspect-[3/4] bg-foreground/5 animate-pulse rounded-xl" />)}
            </div>
          ) : (
            <>
              <TabsContent value="all">
                {all.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No renders yet. Call <code className="text-xs bg-muted px-1 py-0.5 rounded">/api/render</code> to create one.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {all.map(r => <RenderCard key={r.id} render={r} onApprove={approve} onDelete={del} baseUrl={baseUrl} />)}
                  </div>
                )}
              </TabsContent>
              <TabsContent value="approved">
                {approved.length === 0 ? (
                  <div className="text-center py-20 text-muted-foreground">
                    <CheckCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p>No approved renders yet. Approve a render from the All tab.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    {approved.map(r => <RenderCard key={r.id} render={r} onApprove={approve} onDelete={del} baseUrl={baseUrl} />)}
                  </div>
                )}
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </div>
  )
}
