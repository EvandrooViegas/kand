'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Trash2, Pencil, Copy, Moon, Sun, ArrowUpRight, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'
import { KandLogo, KandMark } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }

function buildGradientCssClient(node) {
  const stops = (node.stops || [{ color: '#6366f1', position: 0, alpha: 100 }, { color: '#ec4899', position: 100, alpha: 100 }])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((s) => {
      const a = (typeof s.alpha === 'number' ? s.alpha : 100) / 100
      const hex = s.color || '#000000'
      const r = parseInt(hex.slice(1, 3), 16) || 0
      const g = parseInt(hex.slice(3, 5), 16) || 0
      const b = parseInt(hex.slice(5, 7), 16) || 0
      return `rgba(${r},${g},${b},${a}) ${s.position || 0}%`
    })
    .join(', ')
  if (node.gradientType === 'radial') return `radial-gradient(circle at center, ${stops})`
  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
}

function buildFilterCssClient(filters) {
  if (!filters) return 'none'
  const f = { brightness: 100, contrast: 100, saturate: 100, grayscale: 0, blur: 0, sepia: 0, hueRotate: 0, opacity: 100, ...filters }
  return `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturate}%) grayscale(${f.grayscale}%) sepia(${f.sepia}%) hue-rotate(${f.hueRotate}deg) blur(${f.blur}px) opacity(${f.opacity}%)`
}

// maskRadiusClient removed

function CanvasPreview({ canvas }) {
  const w = canvas.width || 1080
  const scale = 320 / w
  const colorFilter =
    canvas.colorMode === 'grayscale' ? 'grayscale(100%)' :
    canvas.colorMode === 'sepia' ? 'sepia(80%) saturate(120%)' :
    canvas.colorMode === 'invert' ? 'invert(100%)' :
    canvas.colorMode === 'high-contrast' ? 'contrast(160%)' : 'none'
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: canvas.background || '#fff', filter: colorFilter }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: canvas.height || 1080, position: 'relative' }}>
        {(canvas.nodes || []).map((n) => {
          const base = {
            position: 'absolute', left: n.x, top: n.y, width: n.width, height: n.height,
            display: 'flex', alignItems: 'center',
            justifyContent: n.textAlign === 'center' ? 'center' : n.textAlign === 'right' ? 'flex-end' : 'flex-start',
            overflow: n.type === 'text' ? 'visible' : 'hidden',
          }
          let style = base
          if (n.type === 'text') {
            style = { ...base, color: n.color || '#000', fontSize: n.fontSize || 48, fontWeight: n.fontWeight || 400,
              fontStyle: n.fontStyle === 'italic' ? 'italic' : 'normal',
              fontFamily: `'${n.fontFamily || 'Inter'}', sans-serif`,
              textShadow: n.textShadow?.enabled ? `${n.textShadow.offsetX || 0}px ${n.textShadow.offsetY || 0}px ${n.textShadow.blur || 0}px ${n.textShadow.color || '#000'}` : 'none' }
          } else if (n.type === 'shape') {
            style = { ...base, background: n.fill || '#6366f1',
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0),
              border: n.strokeWidth ? `${n.strokeWidth}px solid ${n.stroke || '#000'}` : 'none' }
          } else if (n.type === 'gradient') {
            style = { ...base, backgroundImage: buildGradientCssClient(n),
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0) }
          } else if (n.type === 'image') {
            const br = n.borderRadius || 0
            const cL = n.cropLeft || 0
            const cR = n.cropRight || 0
            const cT = n.cropTop || 0
            const cB = n.cropBottom || 0
            const hasClip = cL > 0 || cR > 0 || cT > 0 || cB > 0
            style = {
              ...base,
              borderRadius: br,
              ...(hasClip ? { clipPath: `inset(${cT}% ${cR}% ${cB}% ${cL}% round ${br}px)` } : {}),
            }
          }
          return (
            <div key={n.id} style={style}>
              {n.type === 'text' ? (n.text || '') : n.type === 'image' && n.src ? (
                <img src={n.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', filter: buildFilterCssClient(n.filters) }} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}

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

function Dashboard() {
  const router = useRouter()
  const [canvases, setCanvases] = useState([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')

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
    const res = await fetch('/api/canvases', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name || 'Untitled' }) })
    const c = await res.json()
    setOpen(false); setName('')
    router.push(`/editor/${c.id}`)
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
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground">
      {/* Header */}
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20">
        <div className="container max-w-6xl mx-auto py-4 flex items-center justify-between px-4">
          <KandLogo size={34} />
          <div className="flex items-center gap-2">
            <a href="#api-docs" className="hidden sm:flex items-center gap-1 text-sm font-medium hover:opacity-70 transition" style={BEBAS}>
              DOCS <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
            <ThemeToggle />
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-5 h-10 font-semibold">
                  <Plus className="w-4 h-4 mr-1.5" />New Design
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Name your design</DialogTitle></DialogHeader>
                <Input placeholder="Summer launch post" value={name} onChange={(e) => setName(e.target.value)} autoFocus onKeyDown={(e) => e.key === 'Enter' && createCanvas()} />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={createCanvas}>Create</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container max-w-6xl mx-auto px-4 pt-12 pb-10 sm:pt-16 sm:pb-14">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
          <div className="md:col-span-9">
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-foreground/80 rounded-full text-xs font-semibold uppercase tracking-widest mb-5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#9AB800] animate-pulse" />
              Design studio · v0.1
            </div>
            <h1 className="leading-[0.85]" style={{ ...BEBAS, fontSize: 'clamp(64px, 11vw, 144px)' }}>
              MAKE ONCE.<br />
              <span className="relative inline-block">
                RENDER FOREVER<span style={{ color: '#9AB800' }}>.</span>
                <span className="absolute -bottom-1 left-0 right-0 h-1.5 bg-[#D4FF00] -z-10" />
              </span>
            </h1>
            <p className="mt-6 text-lg max-w-xl text-foreground/70 leading-relaxed">
              Lay out a design once. Tag any text or image as <span className="font-mono text-sm bg-foreground text-background px-1.5 py-0.5 rounded">{`{dynamic}`}</span>, then render fresh PNGs by POSTing JSON. Templates that talk back.
            </p>
          </div>
          <div className="md:col-span-3 flex md:flex-col md:items-end gap-4 md:gap-1 text-foreground/80">
            <div className="md:text-right">
              <div style={{ ...BEBAS, fontSize: 56, lineHeight: 1 }}>{canvases.length.toString().padStart(2, '0')}</div>
              <div className="text-[11px] uppercase tracking-widest font-semibold">Designs</div>
            </div>
            <div className="md:text-right md:mt-4">
              <div style={{ ...BEBAS, fontSize: 56, lineHeight: 1 }}>{totalNodes.toString().padStart(2, '0')}</div>
              <div className="text-[11px] uppercase tracking-widest font-semibold">Layers</div>
            </div>
          </div>
        </div>
      </section>

      {/* Section title */}
      <div className="container max-w-6xl mx-auto px-4 mb-6 flex items-baseline justify-between border-t-2 border-foreground/15 pt-6">
        <h2 className="text-2xl font-bold" style={BEBAS}>YOUR STUDIO</h2>
        <span className="text-xs uppercase tracking-widest text-foreground/60">Drag · Edit · Render</span>
      </div>

      {/* Cards */}
      <div className="container max-w-6xl mx-auto px-4 pb-20">
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => <div key={i} className="aspect-[4/5] bg-foreground/5 animate-pulse rounded-2xl" />)}
          </div>
        ) : canvases.length === 0 ? (
          <EmptyState onNew={() => setOpen(true)} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
            {canvases.map((c, idx) => (
              <article
                key={c.id}
                className="group relative bg-card rounded-2xl border-2 border-foreground/90 overflow-hidden hover:-translate-y-1 transition-all duration-200 hover:shadow-[8px_8px_0_0_rgba(0,0,0,0.9)] dark:hover:shadow-[8px_8px_0_0_rgba(212,255,0,0.4)]"
              >
                <div className="aspect-square bg-foreground/5 relative cursor-pointer overflow-hidden border-b-2 border-foreground/90" onClick={() => router.push(`/editor/${c.id}`)}>
                  <CanvasPreview canvas={c} />
                  <div className="absolute top-3 left-3 bg-[#D4FF00] text-foreground px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-foreground/90">
                    #{(idx + 1).toString().padStart(2, '0')}
                  </div>
                  <div className="absolute bottom-3 right-3 bg-foreground text-background w-9 h-9 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                    <ArrowUpRight className="w-4 h-4" />
                  </div>
                </div>
                <div className="p-3.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold truncate text-base leading-tight">{c.name}</h3>
                    <p className="text-[11px] uppercase tracking-widest text-foreground/60 mt-0.5">
                      {(c.nodes || []).length} layers · {new Date(c.updatedAt).toLocaleDateString('en', { day: '2-digit', month: 'short' })}
                    </p>
                  </div>
                  <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => router.push(`/editor/${c.id}`)} title="Edit"><Pencil className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-[#D4FF00] hover:text-foreground" onClick={() => duplicateCanvas(c.id)} title="Duplicate"><Copy className="w-3.5 h-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground" onClick={() => deleteCanvas(c.id)} title="Delete"><Trash2 className="w-3.5 h-3.5" /></Button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Footer mini docs */}
      <footer id="api-docs" className="border-t-2 border-foreground/90 bg-foreground text-background mt-12">
        <div className="container max-w-6xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div>
            <div className="flex items-center gap-2 text-background mb-3">
              <KandMark size={28} />
              <span style={{ ...BEBAS, fontSize: 28 }}>KAND<span style={{ color: '#D4FF00' }}>.</span></span>
            </div>
            <p className="text-background/70 text-sm leading-relaxed max-w-md">
              An open canvas with a programmable seam. Build the look in the editor, swap the words via HTTP. No SDK, no auth dance — one POST.
            </p>
          </div>
          <div className="text-sm">
            <div className="text-[11px] uppercase tracking-widest text-[#D4FF00] mb-2">Render endpoint</div>
            <pre className="bg-black/40 border border-background/20 p-3 rounded text-xs overflow-x-auto">{`POST /api/render
{
  "canva_id": "...",
  "data": { "text_1": "Hello", "image1_url": "..." }
}`}</pre>
            <p className="text-background/60 mt-2 text-xs">Returns <span className="font-mono">{`{ url }`}</span> pointing to a PNG. Open the editor → API tab for a copyable cURL for any design.</p>
          </div>
        </div>
        <div className="border-t border-background/15 py-3 text-center text-[11px] uppercase tracking-widest text-background/50">
          Built with satori · sharp · MongoDB
        </div>
      </footer>
    </div>
  )
}

function EmptyState({ onNew }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-foreground/30 p-12 sm:p-16 text-center bg-card relative overflow-hidden">
      <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full bg-[#D4FF00]/30 blur-3xl pointer-events-none" />
      <div className="relative">
        <div className="inline-flex p-3 rounded-2xl bg-foreground text-background mb-6">
          <KandMark size={48} />
        </div>
        <h3 className="text-3xl mb-1" style={BEBAS}>NOTHING HERE — YET.</h3>
        <p className="text-foreground/60 max-w-md mx-auto mb-7">
          Spin up your first template. Pick a font, drop in a placeholder, and you'll have a render-ready endpoint in two minutes.
        </p>
        <Button onClick={onNew} className="bg-foreground text-background hover:bg-foreground/85 h-12 px-7 rounded-full text-base">
          Create your first design <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default Dashboard
