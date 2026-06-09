'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  ArrowLeft, Plus, Trash2, Save, Moon, Sun,
  ChevronUp, ChevronDown, Copy, Check, Layers, Edit3, FileImage, Monitor
} from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { KandLogo } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }
const PAGE_COLORS  = { top_peer: '#D4FF00', content: '#6366f1', bottom_peer: '#9AB800' }
const PAGE_LABELS  = { top_peer: 'Top Peer', content: 'Content', bottom_peer: 'Bottom Peer' }
const PAGE_DESC    = { top_peer: 'Hook — first slide', content: 'Explanation slide', bottom_peer: 'CTA — last slide' }

const PRESETS = [
  { label: '1:1',  w: 1080, h: 1080 },
  { label: '4:5',  w: 1080, h: 1350 },
  { label: '9:16', w: 1080, h: 1920 },
  { label: '16:9', w: 1920, h: 1080 },
  { label: '4:3',  w: 1080, h: 810  },
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

export default function CarouselManager() {
  const router = useRouter()
  const { id } = useParams()
  const [canvas, setCanvas]         = useState(null)
  const [hasChanges, setHasChanges] = useState(false)
  const [selectedPage, setSelectedPage] = useState(null) // page id for highlight only
  const [copiedApi, setCopiedApi]   = useState(false)
  const savedStr = useRef(null)

  const load = useCallback(async () => {
    const res  = await fetch(`/api/canvases/${id}`)
    const data = await res.json()
    if (data.error) { toast.error(data.error); router.push('/'); return }
    if (data.pages) data.pages = [...data.pages].sort((a, b) => a.order - b.order)
    setCanvas(data)
    savedStr.current = JSON.stringify(data)
    if (data.pages?.length && !selectedPage) setSelectedPage(data.pages[0].id)
  }, [id])

  useEffect(() => { load() }, [load])

  // Reload when editor iframe saves
  useEffect(() => {
    const handler = (e) => { if (e.data?.type === 'kand:page-saved') load() }
    window.addEventListener('message', handler)
    return () => window.removeEventListener('message', handler)
  }, [load])

  const save = async () => {
    if (!canvas) return
    const updated = { ...canvas, pages: canvas.pages.map((p, i) => ({ ...p, order: i })) }
    const res = await fetch(`/api/canvases/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    })
    if (res.ok) {
      savedStr.current = JSON.stringify(updated)
      setHasChanges(false)
      toast.success('Saved')
    } else toast.error('Save failed')
  }

  const update = (updater) => {
    setCanvas(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      setHasChanges(JSON.stringify(next) !== savedStr.current)
      return next
    })
  }

  // Change canvas dimensions globally (affects all pages since design is shared)
  const setDimensions = (w, h) => {
    update(c => ({ ...c, width: w, height: h }))
  }

  const addContentPage = () => {
    const pages    = canvas.pages || []
    const bottomIdx = pages.findIndex(p => p.type === 'bottom_peer')
    const insertAt  = bottomIdx === -1 ? pages.length : bottomIdx
    const n         = pages.filter(p => p.type === 'content').length + 1
    const newPage   = { id: uuidv4(), type: 'content', name: `Page ${n}`, order: insertAt }
    const newPages  = [...pages]
    newPages.splice(insertAt, 0, newPage)
    update(c => ({ ...c, pages: newPages.map((p, i) => ({ ...p, order: i })) }))
    setSelectedPage(newPage.id)
  }

  const deletePage = (pageId) => {
    const pages = canvas.pages || []
    const page  = pages.find(p => p.id === pageId)
    if (!page || page.type !== 'content') return toast.error('Only content pages can be deleted')
    const newPages = pages.filter(p => p.id !== pageId).map((p, i) => ({ ...p, order: i }))
    update(c => ({ ...c, pages: newPages }))
    if (selectedPage === pageId) setSelectedPage(newPages[0]?.id || null)
  }

  const movePage = (pageId, dir) => {
    const pages = [...(canvas.pages || [])]
    const idx   = pages.findIndex(p => p.id === pageId)
    if (idx === -1 || pages[idx].type !== 'content') return
    const swap = dir === 'up' ? idx - 1 : idx + 1
    if (swap < 0 || swap >= pages.length || pages[swap].type !== 'content') return
    ;[pages[idx], pages[swap]] = [pages[swap], pages[idx]]
    update(c => ({ ...c, pages: pages.map((p, i) => ({ ...p, order: i })) }))
  }

  const renamePage = (pageId, name) => {
    update(c => ({ ...c, pages: c.pages.map(p => p.id === pageId ? { ...p, name } : p) }))
  }

  if (!canvas) return (
    <div className="h-screen flex items-center justify-center bg-[#FAF7F2] dark:bg-[#0E0D0B]">
      <p className="text-muted-foreground">Loading carousel…</p>
    </div>
  )

  const pages        = [...(canvas.pages || [])].sort((a, b) => a.order - b.order)
  const contentPages = pages.filter(p => p.type === 'content')
  const dynamicKeys  = (canvas.nodes || []).filter(n => n.dynamic_key).map(n => n.dynamic_key)

  const keyVal = (k) => {
    const n = (canvas.nodes || []).find(nd => nd.dynamic_key === k)
    return n?.type === 'image' ? 'https://image.url' : 'your text'
  }
  const peerObj = (suffix) => Object.fromEntries(dynamicKeys.map(k => [`${k}_${suffix}`, keyVal(k)]))
  const apiExample = {
    canva_id: canvas.id,
    top_peer_data:    peerObj('top'),
    content:          contentPages.map((_, i) => Object.fromEntries(dynamicKeys.map(k => [`${k}_${i + 1}`, keyVal(k)]))),
    bottom_peer_data: peerObj('bottom'),
  }

  return (
    <div className="h-screen flex flex-col bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-4 py-2.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ArrowLeft className="w-4 h-4" /></Button>
          <KandLogo size={26} />
          <Input value={canvas.name} onChange={e => update(c => ({ ...c, name: e.target.value }))}
            className="w-44 font-semibold border-2 border-foreground/20 h-8 text-sm" />
          <span className="text-[10px] bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">Carousel</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Button size="sm" onClick={save} disabled={!hasChanges}
            className={`rounded-full px-4 h-8 font-semibold text-xs ${hasChanges ? 'bg-foreground text-background' : 'bg-muted text-muted-foreground'}`}>
            <Save className="w-3.5 h-3.5 mr-1.5" />{hasChanges ? 'Save' : 'Saved'}
          </Button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex min-h-0">

        {/* ── Left panel: pages + settings ─────────────────────────── */}
        <div className="w-60 shrink-0 border-r-2 border-foreground/90 bg-card flex flex-col min-h-0 overflow-y-auto">

          {/* Global canvas size */}
          <div className="p-3 border-b-2 border-foreground/10 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Monitor className="w-3 h-3" />Canvas Size
            </p>
            {/* Presets */}
            <div className="flex flex-wrap gap-1">
              {PRESETS.map(p => {
                const active = canvas.width === p.w && canvas.height === p.h
                return (
                  <button key={p.label}
                    onClick={() => setDimensions(p.w, p.h)}
                    className={`text-[10px] font-bold px-2 py-0.5 rounded border transition ${
                      active ? 'border-foreground bg-[#D4FF00] text-foreground' : 'border-foreground/20 hover:border-foreground/50'
                    }`}>
                    {p.label}
                  </button>
                )
              })}
            </div>
            {/* Custom dimensions */}
            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <Label className="text-[9px]">Width</Label>
                <Input type="number" value={canvas.width} className="h-7 text-xs"
                  onChange={e => setDimensions(parseInt(e.target.value) || canvas.width, canvas.height)} />
              </div>
              <div>
                <Label className="text-[9px]">Height</Label>
                <Input type="number" value={canvas.height} className="h-7 text-xs"
                  onChange={e => setDimensions(canvas.width, parseInt(e.target.value) || canvas.height)} />
              </div>
            </div>
            <p className="text-[9px] text-muted-foreground">Applies to all pages instantly.</p>
          </div>

          {/* Shared design info */}
          <div className="p-3 border-b-2 border-foreground/10 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <FileImage className="w-3 h-3" />Shared Design
            </p>
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              One design used by all pages. Edit it in the canvas — every slide inherits it.
            </p>
            <div className="text-[10px] text-muted-foreground">
              {canvas.nodes?.length || 0} layers · {dynamicKeys.length} dynamic key{dynamicKeys.length !== 1 ? 's' : ''}
            </div>
          </div>

          {/* Add content page */}
          <div className="px-3 py-2 border-b border-foreground/10">
            <Button size="sm" variant="outline" className="w-full border-2 border-foreground/20 text-xs h-7" onClick={addContentPage}>
              <Plus className="w-3 h-3 mr-1" />Add Content Page
            </Button>
          </div>

          {/* Page list */}
          <div className="flex-1 p-3 space-y-2">
            {pages.map((page, idx) => {
              const isContent = page.type === 'content'
              const isActive  = selectedPage === page.id
              const color     = PAGE_COLORS[page.type]
              return (
                <div key={page.id}
                  onClick={() => setSelectedPage(page.id)}
                  className={`rounded-xl border-2 overflow-hidden cursor-pointer transition-all ${
                    isActive ? 'shadow-sm' : 'opacity-70 hover:opacity-100'
                  }`}
                  style={{ borderColor: isActive ? color : color + '40' }}>
                  {/* Top color bar */}
                  <div className="h-1" style={{ background: color }} />
                  <div className="p-2.5">
                    {/* Badge + type */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                        style={{ background: color, color: '#000' }}>
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-[9px] font-bold uppercase tracking-widest truncate" style={{ color }}>
                        {PAGE_LABELS[page.type]}
                      </span>
                    </div>
                    {/* Name */}
                    {isContent ? (
                      <input value={page.name}
                        onClick={e => e.stopPropagation()}
                        onChange={e => renamePage(page.id, e.target.value)}
                        className="text-xs w-full bg-transparent border-0 border-b border-foreground/20 outline-none pb-0.5 font-medium" />
                    ) : (
                      <p className="text-xs text-muted-foreground">{PAGE_DESC[page.type]}</p>
                    )}
                    {/* Content page controls */}
                    {isContent && (
                      <div className="flex items-center gap-1 mt-1.5" onClick={e => e.stopPropagation()}>
                        <button onClick={() => movePage(page.id, 'up')} disabled={idx <= 1}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground disabled:opacity-20">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={() => movePage(page.id, 'down')} disabled={idx >= pages.length - 2}
                          className="h-5 w-5 flex items-center justify-center rounded hover:bg-muted text-muted-foreground disabled:opacity-20">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button onClick={() => deletePage(page.id)}
                          className="ml-auto h-5 w-5 flex items-center justify-center rounded hover:bg-destructive hover:text-destructive-foreground text-muted-foreground transition">
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── Center: shared canvas editor ──────────────────────────── */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Info bar */}
          <div className="h-8 border-b border-foreground/10 bg-muted/20 flex items-center px-4 gap-2 shrink-0">
            <Layers className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">
              Shared design · {canvas.width}×{canvas.height} · editing updates all {pages.length} pages
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <iframe
              key={`${id}-${canvas.width}-${canvas.height}`}
              src={`/editor/${id}`}
              className="w-full h-full border-0"
              title="Shared canvas editor"
              allow="clipboard-read; clipboard-write"
            />
          </div>
        </div>

        {/* ── Right: API panel ──────────────────────────────────────── */}
        <div className="w-60 shrink-0 border-l-2 border-foreground/90 bg-card flex flex-col min-h-0">
          <div className="p-3 border-b-2 border-foreground/10 flex items-center justify-between">
            <p className="text-[10px] font-bold uppercase tracking-widest">API Payload</p>
            <button onClick={() => {
              navigator.clipboard.writeText(JSON.stringify(apiExample, null, 2))
              setCopiedApi(true); setTimeout(() => setCopiedApi(false), 1500)
              toast.success('Copied')
            }} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition">
              {copiedApi ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copiedApi ? 'Copied' : 'Copy'}
            </button>
          </div>
          <div className="p-3 border-b border-foreground/10">
            <p className="text-[10px] text-muted-foreground">
              POST to <code className="bg-muted px-1 rounded">/api/render</code>
              → returns <code className="bg-muted px-1 rounded">.zip</code>
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <pre className="text-[9px] leading-relaxed text-muted-foreground whitespace-pre-wrap break-words">
              {JSON.stringify(apiExample, null, 2)}
            </pre>
          </div>
          {/* ZIP output list */}
          <div className="p-3 border-t border-foreground/10 space-y-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Output ZIP</p>
            {pages.map((p, i) => (
              <div key={p.id}
                className={`flex items-center gap-1.5 text-[10px] rounded px-1.5 py-1 transition ${
                  selectedPage === p.id ? 'bg-muted font-semibold' : 'text-muted-foreground'
                }`}>
                <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PAGE_COLORS[p.type] }} />
                <code className="bg-muted/60 px-1 rounded text-[9px] truncate">
                  {p.type === 'top_peer'    ? '00-top-peer.png'
                  : p.type === 'bottom_peer' ? `${String(i).padStart(2,'0')}-bottom-peer.png`
                  : `${String(i).padStart(2,'0')}-${(p.name||'page').replace(/\s+/g,'-').toLowerCase()}.png`}
                </code>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
