'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  ArrowLeft, Plus, Trash2, Moon, Sun, Zap, Check, X, Clock,
  ImageIcon, Type, ChevronRight, Layers, RefreshCw, Download,
  Calendar, CheckCircle, XCircle, Pencil, ArrowRight, Sparkles
} from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'
import { KandLogo } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }

const COPY_STYLES = [
  {
    id: 'informative',
    label: 'Informative',
    icon: '📚',
    desc: 'Clear, factual, educational.',
    example: '"Did you know? Our product increases productivity by 40% on average."',
  },
  {
    id: 'helpful',
    label: 'Helpful',
    icon: '🤝',
    desc: 'Supportive, solution-focused, empathetic.',
    example: '"Struggling with X? Here\'s a step-by-step guide to make it easier."',
  },
  {
    id: 'aggressive',
    label: 'Aggressive',
    icon: '🔥',
    desc: 'Bold, urgent, FOMO-driven.',
    example: '"Your competition is already doing this. Are you still waiting?"',
  },
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

// ── Step indicator ─────────────────────────────────────────────────────────
function StepBar({ step }) {
  const steps = ['Layouts', 'Sources', 'Generate', 'Schedule']
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        return (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
              active ? 'bg-[#D4FF00] text-foreground' :
              done   ? 'bg-foreground/10 text-foreground/60' :
                       'text-foreground/30'
            }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                active ? 'bg-foreground text-[#D4FF00]' :
                done   ? 'bg-foreground/20 text-foreground/60' :
                         'border-2 border-foreground/20 text-foreground/30'
              }`}>
                {done ? <Check className="w-3 h-3" /> : num}
              </span>
              {label}
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3.5 h-3.5 text-foreground/20 mx-1" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Select Layouts ─────────────────────────────────────────────────
function StepLayouts({ canvases, selected, onToggle }) {
  const singles   = canvases.filter(c => c.type !== 'carousel')
  const carousels = canvases.filter(c => c.type === 'carousel')

  const Card = ({ c }) => {
    const isSelected = selected.includes(c.id)
    const dynamicCount = (c.nodes || []).filter(n => n.dynamic_key).length +
      (c.pages || []).flatMap(p => p.nodes || []).filter(n => n.dynamic_key).length
    return (
      <button
        type="button"
        onClick={() => onToggle(c.id)}
        className={`relative rounded-xl border-2 overflow-hidden text-left transition-all group ${
          isSelected ? 'border-[#D4FF00] shadow-lg' : 'border-foreground/15 hover:border-foreground/40'
        }`}
      >
        {/* Preview */}
        <div className="aspect-square bg-muted relative overflow-hidden" style={{ background: c.background || '#f5f5f5' }}>
          {c.type === 'carousel' ? (
            <div className="h-full flex items-center justify-center">
              <Layers className="w-8 h-8 text-muted-foreground/40" />
            </div>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground p-2">
              {(c.nodes || []).length} layers
            </div>
          )}
          {isSelected && (
            <div className="absolute inset-0 bg-[#D4FF00]/20 flex items-center justify-center">
              <div className="bg-[#D4FF00] rounded-full p-1.5"><Check className="w-4 h-4 text-foreground" /></div>
            </div>
          )}
          {c.type === 'carousel' && (
            <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase">
              Carousel
            </div>
          )}
        </div>
        <div className="p-2.5">
          <p className="font-bold text-xs truncate">{c.name}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {dynamicCount} dynamic key{dynamicCount !== 1 ? 's' : ''}
          </p>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 22 }}>SELECT LAYOUTS</h2>
        <p className="text-sm text-muted-foreground mt-1">Pick the canvas designs you want to use for this flow. You can mix single images and carousels.</p>
      </div>

      {singles.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5" />Single Images ({singles.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {singles.map(c => <Card key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {carousels.length > 0 && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5" />Carousels ({carousels.length})
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {carousels.map(c => <Card key={c.id} c={c} />)}
          </div>
        </div>
      )}

      {canvases.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <ImageIcon className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No designs yet. Create some canvases first.</p>
        </div>
      )}
    </div>
  )
}

// ── Step 2: Configure Sources ──────────────────────────────────────────────
function StepSources({ canvases, selected, configs, onUpdateConfig }) {
  const selectedCanvases = canvases.filter(c => selected.includes(c.id))

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 22 }}>CONFIGURE SOURCES</h2>
        <p className="text-sm text-muted-foreground mt-1">For each dynamic element, define where its content comes from.</p>
      </div>

      {selectedCanvases.map(canvas => {
        // Collect all dynamic nodes across the canvas
        const topLevelNodes = (canvas.nodes || []).filter(n => n.dynamic_key)
        const pageNodes = (canvas.pages || []).flatMap(p =>
          (p.nodes || []).filter(n => n.dynamic_key).map(n => ({ ...n, _pageName: p.name }))
        )
        const allDynamic = [...topLevelNodes, ...pageNodes]

        if (allDynamic.length === 0) return null

        const canvasConfig = configs[canvas.id] || { canvasId: canvas.id, sources: {} }

        return (
          <div key={canvas.id} className="rounded-2xl border-2 border-foreground/15 overflow-hidden">
            {/* Canvas header */}
            <div className="px-4 py-3 bg-muted/30 border-b border-foreground/10 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-[#D4FF00]" />
              <span className="font-bold text-sm">{canvas.name}</span>
              {canvas.type === 'carousel' && (
                <span className="text-[9px] bg-indigo-100 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 px-1.5 py-0.5 rounded-full font-bold uppercase">Carousel</span>
              )}
              <span className="ml-auto text-[10px] text-muted-foreground">{allDynamic.length} dynamic elements</span>
            </div>

            <div className="p-4 space-y-4">
              {allDynamic.map(node => {
                const key = node.dynamic_key
                const src = canvasConfig.sources[key] || { type: node.type === 'image' ? 'image' : 'text', images: [], style: 'informative', topic: '' }

                const updateSrc = (patch) => {
                  onUpdateConfig(canvas.id, {
                    ...canvasConfig,
                    sources: { ...canvasConfig.sources, [key]: { ...src, ...patch } }
                  })
                }

                return (
                  <div key={key} className="rounded-xl border border-foreground/10 p-3 bg-background space-y-3">
                    {/* Key label */}
                    <div className="flex items-center gap-2">
                      {node.type === 'image' ? <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" /> : <Type className="w-3.5 h-3.5 text-muted-foreground" />}
                      <code className="text-xs font-mono font-bold">{`{${key}}`}</code>
                      {node._pageName && <span className="text-[9px] text-muted-foreground">· {node._pageName}</span>}
                      <span className="ml-auto text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{node.type}</span>
                    </div>

                    {node.type === 'image' ? (
                      // Image source: list of URLs
                      <ImageSourceConfig src={src} onUpdate={updateSrc} />
                    ) : (
                      // Text source: copywriting style
                      <TextSourceConfig src={src} onUpdate={updateSrc} />
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ImageSourceConfig({ src, onUpdate }) {
  const [newUrl, setNewUrl] = useState('')
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const addUrl = () => {
    if (!newUrl.trim()) return
    onUpdate({ images: [...(src.images || []), newUrl.trim()] })
    setNewUrl('')
  }

  const removeImg = (i) => {
    onUpdate({ images: (src.images || []).filter((_, idx) => idx !== i) })
  }

  const uploadFile = async (file) => {
    if (!file) return
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file) })
      const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
      const result = await r.json()
      if (result.url) { onUpdate({ images: [...(src.images || []), result.url] }); toast.success('Uploaded') }
      else toast.error(result.error || 'Upload failed')
    } catch (e) { toast.error('Upload failed') }
    finally { setUploading(false) }
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] text-muted-foreground">Add image URLs or upload files. The system will rotate through them when generating posts.</p>
      {/* Existing images */}
      {(src.images || []).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(src.images || []).map((url, i) => (
            <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-foreground/15">
              <img src={url} alt="" className="w-full h-full object-cover" onError={e => { e.target.style.display='none' }} />
              <button onClick={() => removeImg(i)}
                className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition">
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Add by URL */}
      <div className="flex gap-2">
        <Input className="h-7 text-xs flex-1" placeholder="https://image.url/photo.jpg"
          value={newUrl} onChange={e => setNewUrl(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addUrl()} />
        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={addUrl}>Add</Button>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => fileRef.current?.click()}
          disabled={uploading}>
          {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
        </Button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = '' }} />
      </div>
      {(src.images || []).length === 0 && (
        <p className="text-[10px] text-destructive">Add at least one image to generate posts.</p>
      )}
    </div>
  )
}

function TextSourceConfig({ src, onUpdate }) {
  return (
    <div className="space-y-2">
      <div>
        <Label className="text-[10px] text-muted-foreground">Topic (used to personalise the copy)</Label>
        <Input className="h-7 text-xs mt-1" placeholder="e.g. productivity tools, skincare, fitness"
          value={src.topic || ''} onChange={e => onUpdate({ topic: e.target.value })} />
      </div>
      <div>
        <Label className="text-[10px] text-muted-foreground mb-1 block">Copywriting style</Label>
        <div className="space-y-1.5">
          {COPY_STYLES.map(s => (
            <button key={s.id} type="button" onClick={() => onUpdate({ style: s.id })}
              className={`w-full text-left p-2.5 rounded-lg border-2 transition-all ${
                (src.style || 'informative') === s.id
                  ? 'border-foreground bg-[#D4FF00]/10'
                  : 'border-foreground/10 hover:border-foreground/30'
              }`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm">{s.icon}</span>
                <span className="text-xs font-bold">{s.label}</span>
                <span className="text-[10px] text-muted-foreground">— {s.desc}</span>
              </div>
              <p className="text-[10px] text-muted-foreground italic pl-6">{s.example}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Generate & Review ──────────────────────────────────────────────
function StepGenerate({ flow, onGenerate, onUpdatePost, generating }) {
  const posts = flow?.posts || []
  const pending  = posts.filter(p => p.status === 'pending')
  const accepted = posts.filter(p => p.status === 'accepted')
  const rejected = posts.filter(p => p.status === 'rejected')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 style={{ ...BEBAS, fontSize: 22 }}>GENERATED POSTS</h2>
          <p className="text-sm text-muted-foreground mt-1">Review each post. Accept the ones you like, reject the rest.</p>
        </div>
        <Button onClick={onGenerate} disabled={generating}
          className="bg-[#D4FF00] text-foreground hover:bg-[#D4FF00]/80 font-bold rounded-full px-6">
          {generating ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4 mr-2" />{posts.length > 0 ? 'Regenerate' : 'Generate 5 Posts'}</>}
        </Button>
      </div>

      {posts.length === 0 && !generating && (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-foreground/15 rounded-2xl">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No posts yet</p>
          <p className="text-sm mt-1">Click Generate to create 5 posts from your configured layouts.</p>
        </div>
      )}

      {posts.length > 0 && (
        <Tabs defaultValue="pending">
          <TabsList className="border-2 border-foreground/15 bg-card mb-4">
            <TabsTrigger value="pending" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">
              Review ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="accepted" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">
              Accepted ({accepted.length})
            </TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">
              Rejected ({rejected.length})
            </TabsTrigger>
          </TabsList>

          {[['pending', pending], ['accepted', accepted], ['rejected', rejected]].map(([tab, list]) => (
            <TabsContent key={tab} value={tab}>
              {list.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground text-sm">No {tab} posts.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {list.map(post => (
                    <PostCard key={post.id} post={post} onUpdate={onUpdatePost} />
                  ))}
                </div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

function PostCard({ post, onUpdate }) {
  const isCarousel = post.canvasType === 'carousel'
  const url = post.render?.url

  return (
    <div className={`rounded-xl border-2 overflow-hidden transition-all ${
      post.status === 'accepted' ? 'border-[#9AB800]' :
      post.status === 'rejected' ? 'border-foreground/10 opacity-50' :
      'border-foreground/15'
    }`}>
      {/* Preview */}
      <div className="aspect-square bg-muted relative overflow-hidden">
        {url && !isCarousel ? (
          <img src={url} alt="post" className="w-full h-full object-cover" />
        ) : (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <Layers className="w-6 h-6 opacity-40" />
            <span className="text-[9px]">{isCarousel ? 'Carousel' : 'Rendered'}</span>
          </div>
        )}
        {/* Status badge */}
        {post.status === 'accepted' && (
          <div className="absolute top-2 right-2 bg-[#9AB800] rounded-full p-1">
            <Check className="w-3 h-3 text-white" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-2">
        <p className="text-[10px] font-bold truncate">{post.canvasName}</p>
        {post.scheduledAt && (
          <p className="text-[9px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Clock className="w-2.5 h-2.5" />
            {new Date(post.scheduledAt).toLocaleString('en', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex border-t border-foreground/10">
        {url && (
          <a href={url} target="_blank" rel="noreferrer" className="flex-1">
            <button className="w-full h-7 text-[10px] text-muted-foreground hover:bg-muted transition flex items-center justify-center">
              <Download className="w-3 h-3" />
            </button>
          </a>
        )}
        {post.status !== 'accepted' && (
          <button onClick={() => onUpdate(post.id, { status: 'accepted' })}
            className="flex-1 h-7 text-[10px] text-[#9AB800] hover:bg-[#9AB800]/10 transition flex items-center justify-center">
            <CheckCircle className="w-3.5 h-3.5" />
          </button>
        )}
        {post.status !== 'rejected' && (
          <button onClick={() => onUpdate(post.id, { status: 'rejected' })}
            className="flex-1 h-7 text-[10px] text-destructive hover:bg-destructive/10 transition flex items-center justify-center">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        )}
        {post.status === 'rejected' && (
          <button onClick={() => onUpdate(post.id, { status: 'pending' })}
            className="flex-1 h-7 text-[10px] text-muted-foreground hover:bg-muted transition flex items-center justify-center">
            <RefreshCw className="w-3 h-3" />
          </button>
        )}
      </div>
    </div>
  )
}

// ── Step 4: Schedule ───────────────────────────────────────────────────────
function StepSchedule({ flow, onUpdatePost }) {
  const accepted = (flow?.posts || []).filter(p => p.status === 'accepted')

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 22 }}>SCHEDULE POSTS</h2>
        <p className="text-sm text-muted-foreground mt-1">Set a date and time for each accepted post to go live on Instagram.</p>
      </div>

      {accepted.length === 0 && (
        <div className="text-center py-20 text-muted-foreground border-2 border-dashed border-foreground/15 rounded-2xl">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accepted posts yet</p>
          <p className="text-sm mt-1">Go back to Generate and accept some posts first.</p>
        </div>
      )}

      {accepted.length > 0 && (
        <div className="space-y-3">
          {accepted.map(post => {
            const url = post.render?.url
            return (
              <div key={post.id} className="flex items-center gap-4 rounded-xl border-2 border-foreground/15 p-3 bg-card">
                {/* Thumbnail */}
                <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                  {url && post.canvasType !== 'carousel' ? (
                    <img src={url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Layers className="w-5 h-5 text-muted-foreground/40" />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{post.canvasName}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {post.canvasType === 'carousel' ? 'Carousel' : 'Single image'}
                  </p>
                </div>

                {/* Date picker */}
                <div className="flex items-center gap-2 shrink-0">
                  <input
                    type="datetime-local"
                    className="h-8 text-xs border-2 border-foreground/20 rounded-lg px-2 bg-background"
                    value={post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : ''}
                    min={new Date().toISOString().slice(0, 16)}
                    onChange={e => onUpdatePost(post.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
                  />
                  {post.scheduledAt && (
                    <div className="flex items-center gap-1 text-[10px] text-[#9AB800] font-bold">
                      <Clock className="w-3 h-3" />Scheduled
                    </div>
                  )}
                </div>
              </div>
            )
          })}

          {accepted.filter(p => p.scheduledAt).length > 0 && (
            <div className="pt-4 border-t border-foreground/10">
              <div className="rounded-xl bg-[#D4FF00]/10 border-2 border-[#D4FF00] p-4 flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-[#9AB800] shrink-0" />
                <div>
                  <p className="font-bold text-sm">{accepted.filter(p => p.scheduledAt).length} post{accepted.filter(p => p.scheduledAt).length !== 1 ? 's' : ''} scheduled</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Posts will be queued for publishing at the selected times. Connect your Instagram account to enable auto-posting.</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Flow Page ─────────────────────────────────────────────────────────
export default function FlowPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [canvases, setCanvases] = useState([])
  const [flows, setFlows] = useState([])
  const [activeFlow, setActiveFlow] = useState(null)
  const [selectedLayouts, setSelectedLayouts] = useState([])
  const [configs, setConfigs] = useState({}) // { [canvasId]: canvasConfig }
  const [generating, setGenerating] = useState(false)
  const [showFlowList, setShowFlowList] = useState(true)
  const [newFlowName, setNewFlowName] = useState('')
  const [creatingFlow, setCreatingFlow] = useState(false)

  useEffect(() => {
    fetch('/api/canvases').then(r => r.json()).then(d => setCanvases(Array.isArray(d) ? d : []))
    fetch('/api/flows').then(r => r.json()).then(d => setFlows(Array.isArray(d) ? d : []))
  }, [])

  const toggleLayout = (id) => {
    setSelectedLayouts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
  }

  const updateConfig = (canvasId, config) => {
    setConfigs(prev => ({ ...prev, [canvasId]: config }))
  }

  const createFlow = async () => {
    if (!newFlowName.trim()) return
    setCreatingFlow(true)
    try {
      const res = await fetch('/api/flows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newFlowName.trim() }) })
      const flow = await res.json()
      setFlows(prev => [flow, ...prev])
      setActiveFlow(flow)
      setSelectedLayouts([])
      setConfigs({})
      setStep(1)
      setShowFlowList(false)
      setNewFlowName('')
    } catch { toast.error('Failed to create flow') }
    finally { setCreatingFlow(false) }
  }

  const saveFlowState = async (patch = {}) => {
    if (!activeFlow) return
    const updated = {
      ...activeFlow,
      canvasConfigs: selectedLayouts.map(id => ({
        canvasId: id,
        ...(configs[id] || { sources: {} })
      })),
      ...patch,
    }
    try {
      const res = await fetch(`/api/flows/${activeFlow.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(updated) })
      const saved = await res.json()
      setActiveFlow(saved)
      setFlows(prev => prev.map(f => f.id === saved.id ? saved : f))
    } catch { toast.error('Failed to save') }
  }

  const generate = async () => {
    if (!activeFlow) return
    await saveFlowState()
    setGenerating(true)
    try {
      const res = await fetch(`/api/flows/${activeFlow.id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then(r => r.json())
        setActiveFlow(refreshed)
        toast.success(`${data.postCount} posts generated`)
      } else toast.error(data.error || 'Generation failed')
    } catch { toast.error('Generation failed') }
    finally { setGenerating(false) }
  }

  const updatePost = async (postId, patch) => {
    if (!activeFlow) return
    try {
      await fetch(`/api/flows/${activeFlow.id}/posts/${postId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
      const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then(r => r.json())
      setActiveFlow(refreshed)
    } catch { toast.error('Failed to update post') }
  }

  const openFlow = (flow) => {
    setActiveFlow(flow)
    setSelectedLayouts((flow.canvasConfigs || []).map(c => c.canvasId))
    const cfgMap = {}
    for (const cc of flow.canvasConfigs || []) cfgMap[cc.canvasId] = cc
    setConfigs(cfgMap)
    setStep(flow.posts?.length > 0 ? 3 : 1)
    setShowFlowList(false)
  }

  const canAdvance = () => {
    if (step === 1) return selectedLayouts.length > 0
    if (step === 2) return true
    if (step === 3) return (activeFlow?.posts || []).some(p => p.status === 'accepted')
    return true
  }

  // ── Flow list / landing ────────────────────────────────────────────────
  if (showFlowList) {
    return (
      <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground">
        <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20 px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => router.push('/')}><ArrowLeft className="w-4 h-4" /></Button>
            <KandLogo size={28} />
            <span style={{ ...BEBAS, fontSize: 22 }}>FLOW</span>
            <span className="text-[10px] bg-[#D4FF00] text-foreground px-2 py-0.5 rounded-full font-bold border border-foreground/20">BETA</span>
          </div>
          <ThemeToggle />
        </header>

        <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
          {/* Intro */}
          <div>
            <h1 style={{ ...BEBAS, fontSize: 'clamp(40px, 6vw, 72px)', lineHeight: 0.9 }}>
              AUTOMATE YOUR<br />
              <span style={{ color: '#9AB800' }}>INSTAGRAM FEED.</span>
            </h1>
            <p className="mt-4 text-foreground/70 max-w-xl">
              Pick your layouts, set the sources, generate posts, and schedule them — all in one flow.
            </p>
          </div>

          {/* New flow */}
          <div className="flex gap-3">
            <Input placeholder="Name your flow (e.g. Weekly Product Posts)"
              value={newFlowName} onChange={e => setNewFlowName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createFlow()}
              className="max-w-sm border-2 border-foreground/20" />
            <Button onClick={createFlow} disabled={creatingFlow || !newFlowName.trim()}
              className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold">
              <Plus className="w-4 h-4 mr-1.5" />New Flow
            </Button>
          </div>

          {/* Existing flows */}
          {flows.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Your Flows</p>
              <div className="space-y-2">
                {flows.map(flow => {
                  const accepted = (flow.posts || []).filter(p => p.status === 'accepted').length
                  const scheduled = (flow.posts || []).filter(p => p.scheduledAt).length
                  return (
                    <div key={flow.id}
                      className="flex items-center gap-4 p-4 rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition cursor-pointer group"
                      onClick={() => openFlow(flow)}>
                      <div className="w-10 h-10 rounded-lg bg-[#D4FF00]/20 border border-[#D4FF00]/40 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-[#9AB800]" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold truncate">{flow.name}</p>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {(flow.canvasConfigs || []).length} layout{(flow.canvasConfigs || []).length !== 1 ? 's' : ''} ·{' '}
                          {(flow.posts || []).length} posts · {accepted} accepted · {scheduled} scheduled
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                          flow.status === 'ready' ? 'border-[#9AB800] text-[#9AB800]' : 'border-foreground/20 text-foreground/40'
                        }`}>{flow.status}</span>
                        <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition" />
                      </div>
                      <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={async e => { e.stopPropagation(); if (!confirm('Delete this flow?')) return; await fetch(`/api/flows/${flow.id}`, { method: 'DELETE' }); setFlows(prev => prev.filter(f => f.id !== flow.id)); toast.success('Deleted') }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Active flow editor ─────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground flex flex-col">
      {/* Header */}
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => setShowFlowList(true)}><ArrowLeft className="w-4 h-4" /></Button>
        <KandLogo size={26} />
        <span className="font-bold text-sm truncate max-w-48">{activeFlow?.name}</span>
        <div className="flex-1" />
        <StepBar step={step} />
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      {/* Content */}
      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {step === 1 && (
          <StepLayouts canvases={canvases} selected={selectedLayouts} onToggle={toggleLayout} />
        )}
        {step === 2 && (
          <StepSources canvases={canvases} selected={selectedLayouts} configs={configs} onUpdateConfig={updateConfig} />
        )}
        {step === 3 && (
          <StepGenerate flow={activeFlow} onGenerate={generate} onUpdatePost={updatePost} generating={generating} />
        )}
        {step === 4 && (
          <StepSchedule flow={activeFlow} onUpdatePost={updatePost} />
        )}
      </div>

      {/* Footer nav */}
      <div className="sticky bottom-0 border-t-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-6 py-3 flex items-center justify-between">
        <Button variant="outline" className="border-2" onClick={() => step > 1 ? setStep(s => s - 1) : setShowFlowList(true)}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />{step === 1 ? 'Flows' : 'Back'}
        </Button>
        <span className="text-[11px] text-muted-foreground">
          {step === 1 && `${selectedLayouts.length} layout${selectedLayouts.length !== 1 ? 's' : ''} selected`}
          {step === 2 && 'Configure sources for each dynamic element'}
          {step === 3 && `${(activeFlow?.posts || []).filter(p => p.status === 'accepted').length} posts accepted`}
          {step === 4 && `${(activeFlow?.posts || []).filter(p => p.scheduledAt).length} posts scheduled`}
        </span>
        {step < 4 ? (
          <Button
            disabled={!canAdvance()}
            onClick={async () => {
              if (step === 2) await saveFlowState()
              setStep(s => s + 1)
            }}
            className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold">
            {step === 2 ? 'Save & Continue' : 'Continue'}<ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <Button
            disabled={(activeFlow?.posts || []).filter(p => p.scheduledAt).length === 0}
            onClick={async () => { await saveFlowState(); toast.success('Flow saved and posts scheduled!') }}
            className="bg-[#D4FF00] text-foreground hover:bg-[#D4FF00]/80 rounded-full px-6 font-semibold">
            <CheckCircle className="w-4 h-4 mr-1.5" />Confirm Schedule
          </Button>
        )}
      </div>
    </div>
  )
}
