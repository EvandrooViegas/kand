'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  ArrowLeft, Plus, Trash2, Moon, Sun, Zap, Check, X, Clock,
  ImageIcon, ChevronRight, Layers, RefreshCw, Download,
  Calendar, CheckCircle, XCircle, Pencil, ArrowRight, Sparkles,
  Building2, Users, Mic2, BookOpen, Upload, FolderOpen, Save, Type,
} from 'lucide-react'
import { toast } from 'sonner'
import { KandLogo } from '@/components/logo'

const BEBAS = { fontFamily: "'Bebas Neue', sans-serif", letterSpacing: '0.01em' }
const TONES = [
  { id: 'informative', icon: '📚', label: 'Informative', desc: 'Clear, factual, educational' },
  { id: 'helpful',     icon: '🤝', label: 'Helpful',     desc: 'Warm, supportive, practical' },
  { id: 'aggressive',  icon: '🔥', label: 'Aggressive',  desc: 'Bold, urgent, FOMO-driven' },
  { id: 'inspiring',   icon: '✨', label: 'Inspiring',   desc: 'Motivational, aspirational' },
  { id: 'playful',     icon: '😄', label: 'Playful',     desc: 'Fun, witty, conversational' },
]

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [m, setM] = useState(false)
  useEffect(() => setM(true), [])
  if (!m) return null
  return (
    <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </Button>
  )
}

function StepBar({ step, maxStep, onGoTo }) {
  const steps = ['Brand', 'Configure', 'Ideas', 'Generate', 'Schedule']
  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        const reachable = num <= maxStep
        return (
          <div key={label} className="flex items-center">
            <button type="button" disabled={!reachable} onClick={() => reachable && onGoTo(num)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                active ? 'bg-[#D4FF00] text-foreground' :
                done   ? 'bg-foreground/10 text-foreground/60 hover:bg-foreground/20 cursor-pointer' :
                         'text-foreground/25 cursor-default'
              }`}>
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                active ? 'bg-foreground text-[#D4FF00]' :
                done   ? 'bg-foreground/20' : 'border-2 border-foreground/15'
              }`}>
                {done ? <Check className="w-2.5 h-2.5" /> : num}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-foreground/15 mx-0.5" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Step 1: Brand Context ─────────────────────────────────────────────────
function StepBrand({ brand, onChange }) {
  const fields = [
    { key: 'businessName', label: 'Business / Brand Name',        icon: Building2, placeholder: 'Acme Corp' },
    { key: 'description',  label: 'What you do (2-3 sentences)',  icon: BookOpen,  placeholder: 'We help small businesses automate social media.', multiline: true },
    { key: 'audience',     label: 'Target Audience',              icon: Users,     placeholder: 'Small business owners aged 25-45.' },
    { key: 'voice',        label: 'Brand Voice / Personality',    icon: Mic2,      placeholder: 'Professional but approachable, never jargony.', multiline: true },
    { key: 'extra',        label: 'Anything else the AI should know', icon: Sparkles, placeholder: 'Q4 holiday promo. Always end with a CTA.', multiline: true },
  ]
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 26 }}>BRAND CONTEXT</h2>
        <p className="text-sm text-muted-foreground mt-1">This is passed to the AI for every post in this flow. The more detail, the better the copy.</p>
      </div>
      {fields.map(({ key, label, icon: Icon, placeholder, multiline }) => (
        <div key={key}>
          <Label className="text-xs font-semibold flex items-center gap-1.5 mb-1.5">
            <Icon className="w-3.5 h-3.5 text-muted-foreground" />{label}
          </Label>
          {multiline
            ? <Textarea rows={3} className="text-sm" placeholder={placeholder} value={brand[key] || ''} onChange={e => onChange({ ...brand, [key]: e.target.value })} />
            : <Input className="text-sm" placeholder={placeholder} value={brand[key] || ''} onChange={e => onChange({ ...brand, [key]: e.target.value })} />
          }
        </div>
      ))}
    </div>
  )
}

// ── Gallery Manager (modal) ───────────────────────────────────────────────
function GalleryManager({ galleries, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState(null)
  const [newUrl, setNewUrl] = useState('')
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const createGallery = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/galleries', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) })
    const g = await res.json(); setNewName(''); onRefresh(); setSelected(g.id)
  }
  const gallery = galleries.find(g => g.id === selected)

  const addUrl = async () => {
    if (!newUrl.trim() || !gallery) return
    await fetch(`/api/galleries/${gallery.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gallery, images: [...gallery.images, newUrl.trim()] }) })
    setNewUrl(''); onRefresh()
  }
  const removeImg = async (idx) => {
    if (!gallery) return
    await fetch(`/api/galleries/${gallery.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gallery, images: gallery.images.filter((_, i) => i !== idx) }) })
    onRefresh()
  }
  const uploadFile = async (file) => {
    if (!file || !gallery) return
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((res, rej) => { reader.onload = () => res(reader.result); reader.onerror = rej; reader.readAsDataURL(file) })
      const r = await fetch('/api/uploads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ data: dataUrl }) })
      const result = await r.json()
      if (result.url) {
        await fetch(`/api/galleries/${gallery.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...gallery, images: [...gallery.images, result.url] }) })
        onRefresh(); toast.success('Uploaded')
      }
    } catch { toast.error('Upload failed') }
    finally { setUploading(false) }
  }
  const deleteGallery = async (id) => {
    if (!confirm('Delete this gallery?')) return
    await fetch(`/api/galleries/${id}`, { method: 'DELETE' })
    if (selected === id) setSelected(null); onRefresh()
  }

  return (
    <div className="flex gap-4 h-[460px]">
      <div className="w-44 shrink-0 border-r border-foreground/10 pr-4 flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Galleries</p>
        <div className="flex gap-1">
          <Input className="h-7 text-xs flex-1" placeholder="New gallery…" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createGallery()} />
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={createGallery}><Plus className="w-3 h-3" /></Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {galleries.map(g => (
            <div key={g.id} className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition ${selected === g.id ? 'bg-[#D4FF00]/20 font-semibold' : 'hover:bg-muted'}`} onClick={() => setSelected(g.id)}>
              <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 truncate">{g.name}</span>
              <span className="text-[9px] text-muted-foreground">{g.images.length}</span>
              <button onClick={e => { e.stopPropagation(); deleteGallery(g.id) }} className="opacity-0 group-hover:opacity-100 hover:text-destructive transition"><Trash2 className="w-2.5 h-2.5" /></button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!gallery ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">Select or create a gallery</div>
        ) : (
          <>
            <p className="text-sm font-bold">{gallery.name} <span className="font-normal text-muted-foreground">({gallery.images.length} images)</span></p>
            <div className="flex gap-2">
              <Input className="h-7 text-xs flex-1" placeholder="https://image.url" value={newUrl} onChange={e => setNewUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && addUrl()} />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addUrl}>Add URL</Button>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => fileRef.current?.click()} disabled={uploading}>
                {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { Array.from(e.target.files || []).forEach(f => uploadFile(f)); e.target.value = '' }} />
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 content-start">
              {gallery.images.length === 0 ? (
                <div className="col-span-4 flex items-center justify-center h-24 border-2 border-dashed border-foreground/15 rounded-xl text-muted-foreground text-sm">Add images above</div>
              ) : gallery.images.map((url, i) => (
                <div key={i} className="relative group aspect-square rounded-lg overflow-hidden border border-foreground/10">
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <button onClick={() => removeImg(i)} className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"><Trash2 className="w-4 h-4 text-white" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Step 2: Configure (canvases + gallery + tone) ─────────────────────────
function StepConfigure({ canvases, selectedCanvases, onToggleCanvas, galleryId, onSetGallery, tone, onSetTone, galleries, onRefreshGalleries }) {
  const [galleryOpen, setGalleryOpen] = useState(false)
  const singles   = canvases.filter(c => c.type !== 'carousel')
  const carousels = canvases.filter(c => c.type === 'carousel')
  const selectedGallery = galleries.find(g => g.id === galleryId)

  const CanvasCard = ({ c }) => {
    const isSel = selectedCanvases.includes(c.id)
    const dynCount = [...(c.nodes || []), ...(c.pages || []).flatMap(p => p.nodes || [])].filter(n => n.dynamic_key).length
    return (
      <button type="button" onClick={() => onToggleCanvas(c.id)}
        className={`relative rounded-xl border-2 overflow-hidden text-left transition-all ${isSel ? 'border-[#D4FF00] shadow-md' : 'border-foreground/15 hover:border-foreground/40'}`}>
        <div className="aspect-square relative flex items-center justify-center" style={{ background: c.background || '#f5f5f5' }}>
          {c.type === 'carousel' ? <Layers className="w-8 h-8 text-muted-foreground/30" /> : <ImageIcon className="w-8 h-8 text-muted-foreground/30" />}
          {isSel && <div className="absolute inset-0 bg-[#D4FF00]/25 flex items-center justify-center"><div className="bg-[#D4FF00] rounded-full p-1.5"><Check className="w-4 h-4 text-foreground" /></div></div>}
          {c.type === 'carousel' && <div className="absolute top-2 right-2 bg-indigo-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">Carousel</div>}
        </div>
        <div className="p-2">
          <p className="font-bold text-xs truncate">{c.name}</p>
          <p className="text-[10px] text-muted-foreground">{dynCount} dynamic key{dynCount !== 1 ? 's' : ''}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-8">
      <div><h2 style={{ ...BEBAS, fontSize: 26 }}>CONFIGURE</h2>
      <p className="text-sm text-muted-foreground mt-1">Select which layouts to use, pick a gallery for images, and set the tone for the AI copy.</p></div>

      {/* Canvas selection */}
      <div className="space-y-4">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Select Layouts</p>
        {singles.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><ImageIcon className="w-3 h-3" />Single Images</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{singles.map(c => <CanvasCard key={c.id} c={c} />)}</div>
          </div>
        )}
        {carousels.length > 0 && (
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 flex items-center gap-1"><Layers className="w-3 h-3" />Carousels</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{carousels.map(c => <CanvasCard key={c.id} c={c} />)}</div>
          </div>
        )}
      </div>

      {/* Gallery */}
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Image Gallery</p>
        <p className="text-xs text-muted-foreground">The AI picks random images from this gallery for any image dynamic keys.</p>
        <div className="flex items-center gap-3">
          <select className="h-9 border-2 border-foreground/20 rounded-lg px-3 text-sm bg-background flex-1 max-w-xs"
            value={galleryId || ''} onChange={e => onSetGallery(e.target.value || null)}>
            <option value="">— No gallery (image keys left empty) —</option>
            {galleries.map(g => <option key={g.id} value={g.id}>{g.name} ({g.images.length} images)</option>)}
          </select>
          <Button variant="outline" className="border-2" onClick={() => setGalleryOpen(true)}>
            <FolderOpen className="w-4 h-4 mr-1.5" />Manage Galleries
          </Button>
        </div>
        {selectedGallery && (
          <div className="flex gap-1.5 flex-wrap">
            {selectedGallery.images.slice(0, 8).map((url, i) => (
              <div key={i} className="w-10 h-10 rounded overflow-hidden border border-foreground/10"><img src={url} alt="" className="w-full h-full object-cover" /></div>
            ))}
            {selectedGallery.images.length > 8 && <div className="w-10 h-10 rounded bg-muted flex items-center justify-center text-[9px] text-muted-foreground">+{selectedGallery.images.length - 8}</div>}
          </div>
        )}
      </div>

      {/* Tone */}
      <div className="space-y-3">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Copywriting Tone</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {TONES.map(t => (
            <button key={t.id} type="button" onClick={() => onSetTone(t.id)}
              className={`text-left p-3 rounded-xl border-2 transition-all ${tone === t.id ? 'border-foreground bg-[#D4FF00]/10' : 'border-foreground/10 hover:border-foreground/30'}`}>
              <div className="flex items-center gap-1.5 mb-1"><span>{t.icon}</span><span className="text-xs font-bold">{t.label}</span></div>
              <p className="text-[10px] text-muted-foreground leading-tight">{t.desc}</p>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={galleryOpen} onOpenChange={setGalleryOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader><p className="text-xl font-bold" style={BEBAS}>IMAGE GALLERIES</p></DialogHeader>
          <GalleryManager galleries={galleries} onRefresh={onRefreshGalleries} />
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Edit Post Dialog ──────────────────────────────────────────────────────
function EditPostDialog({ post, canvases, open, onClose, onSave, brand, tone }) {
  const [data, setData] = useState({})
  const [regen, setRegen] = useState({})
  const canvas = canvases.find(c => c.id === post?.canvasId)

  useEffect(() => { if (post) setData({ ...post.data }) }, [post?.id])

  const allNodes = canvas ? [
    ...(canvas.nodes || []),
    ...(canvas.pages || []).flatMap(p => p.nodes || []),
  ].filter(n => n.dynamic_key) : []

  const regenKey = async (key) => {
    setRegen(r => ({ ...r, [key]: true }))
    try {
      const brandCtx = [brand?.businessName, brand?.description, brand?.audience, brand?.voice].filter(Boolean).join('. ')
      const classNames = Object.keys(canvas?.classes || {}).join(', ')
      const res = await fetch('/api/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, topic: key, brandContext: brandCtx, tone: tone || 'informative', classContext: classNames ? `Classes: ${classNames}` : '' }),
      })
      const result = await res.json()
      if (result.text) setData(d => ({ ...d, [key]: result.text }))
    } catch { toast.error('Regeneration failed') }
    finally { setRegen(r => ({ ...r, [key]: false })) }
  }

  if (!post) return null
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><p className="font-bold">Edit Post — {post.canvasName}</p></DialogHeader>
        <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
          {allNodes.map(node => {
            const key = node.dynamic_key
            return (
              <div key={key} className="space-y-1">
                <div className="flex items-center gap-2">
                  {node.type === 'image' ? <ImageIcon className="w-3 h-3 text-muted-foreground" /> : <Type className="w-3 h-3 text-muted-foreground" />}
                  <code className="text-xs font-mono font-bold">{`{${key}}`}</code>
                  {node.type === 'text' && (
                    <Button size="sm" variant="ghost" className="h-5 text-[10px] ml-auto" disabled={regen[key]} onClick={() => regenKey(key)}>
                      {regen[key] ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Sparkles className="w-3 h-3 mr-1" />}Regen
                    </Button>
                  )}
                </div>
                {node.type === 'image' ? (
                  <div className="space-y-1">
                    {data[key] && <img src={data[key]} alt="" className="h-14 rounded object-cover" onError={e => { e.target.style.display = 'none' }} />}
                    <Input className="h-7 text-xs" placeholder="Image URL" value={data[key] || ''} onChange={e => setData(d => ({ ...d, [key]: e.target.value }))} />
                  </div>
                ) : (
                  <Textarea rows={2} className="text-xs" value={data[key] || ''} onChange={e => setData(d => ({ ...d, [key]: e.target.value }))} />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex gap-2 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={() => onSave(data)}><Save className="w-4 h-4 mr-1.5" />Save & Re-render</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Step 3: Generate & Review ─────────────────────────────────────────────
function StepGenerate({ flow, canvases, onGenerate, onUpdatePost, onRerender, generating, brand, tone }) {
  const posts = flow?.posts || []
  const [editPost, setEditPost] = useState(null)
  const pending  = posts.filter(p => p.status === 'pending')
  const accepted = posts.filter(p => p.status === 'accepted')
  const rejected = posts.filter(p => p.status === 'rejected')

  const PostCard = ({ post }) => {
    const url = post.render?.url
    const isCarousel = post.canvasType === 'carousel'
    return (
      <div className={`rounded-xl border-2 overflow-hidden transition-all ${
        post.status === 'accepted' ? 'border-[#9AB800]' :
        post.status === 'rejected' ? 'border-foreground/10 opacity-40' : 'border-foreground/15'
      }`}>
        <div className="aspect-square bg-muted relative overflow-hidden">
          {url && !isCarousel
            ? <img src={url} alt="" className="w-full h-full object-cover" />
            : <div className="h-full flex flex-col items-center justify-center gap-1 text-muted-foreground"><Layers className="w-6 h-6 opacity-30" /><span className="text-[9px]">{isCarousel ? 'Carousel' : '…'}</span></div>
          }
          {post.status === 'accepted' && <div className="absolute top-2 right-2 bg-[#9AB800] rounded-full p-1"><Check className="w-3 h-3 text-white" /></div>}
        </div>
        <div className="p-2 border-b border-foreground/10">
          <p className="text-[10px] font-bold truncate">{post.canvasName}</p>
          {/* Show generated text preview */}
          {Object.entries(post.data || {}).filter(([, v]) => typeof v === 'string' && !v.startsWith('http')).slice(0, 1).map(([k, v]) => (
            <p key={k} className="text-[9px] text-muted-foreground truncate mt-0.5">"{v}"</p>
          ))}
        </div>
        <div className="flex">
          <button onClick={() => setEditPost(post)} className="flex-1 h-7 text-[10px] text-muted-foreground hover:bg-muted transition flex items-center justify-center gap-1"><Pencil className="w-3 h-3" />Edit</button>
          {url && <a href={url} target="_blank" rel="noreferrer" className="flex-1"><button className="w-full h-7 text-[10px] text-muted-foreground hover:bg-muted transition flex items-center justify-center"><Download className="w-3 h-3" /></button></a>}
          {post.status !== 'accepted' && <button onClick={() => onUpdatePost(post.id, { status: 'accepted' })} className="flex-1 h-7 text-[10px] text-[#9AB800] hover:bg-[#9AB800]/10 transition flex items-center justify-center"><CheckCircle className="w-3.5 h-3.5" /></button>}
          {post.status !== 'rejected' && <button onClick={() => onUpdatePost(post.id, { status: 'rejected' })} className="flex-1 h-7 text-[10px] text-destructive hover:bg-destructive/10 transition flex items-center justify-center"><XCircle className="w-3.5 h-3.5" /></button>}
          {post.status === 'rejected' && <button onClick={() => onUpdatePost(post.id, { status: 'pending' })} className="flex-1 h-7 text-[10px] text-muted-foreground hover:bg-muted transition flex items-center justify-center"><RefreshCw className="w-3 h-3" /></button>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 style={{ ...BEBAS, fontSize: 26 }}>GENERATED POSTS</h2>
          <p className="text-sm text-muted-foreground mt-1">AI picks a random layout, reads its dynamic keys, and generates the content. Review below.</p>
        </div>
        <Button onClick={onGenerate} disabled={generating} className="bg-[#D4FF00] text-foreground hover:bg-[#D4FF00]/80 font-bold rounded-full px-6">
          {generating ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating…</> : <><Sparkles className="w-4 h-4 mr-2" />{posts.length > 0 ? 'Generate 3 more' : 'Generate 3 Posts'}</>}
        </Button>
      </div>

      {posts.length === 0 && !generating && (
        <div className="text-center py-20 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Ready to generate</p>
          <p className="text-sm mt-1">Click the button above. The AI will write all the copy using your brand context and chosen tone.</p>
        </div>
      )}

      {posts.length > 0 && (
        <Tabs defaultValue="pending">
          <TabsList className="border-2 border-foreground/15 bg-card mb-4">
            <TabsTrigger value="pending" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">Review ({pending.length})</TabsTrigger>
            <TabsTrigger value="accepted" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">Accepted ({accepted.length})</TabsTrigger>
            <TabsTrigger value="rejected" className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider">Rejected ({rejected.length})</TabsTrigger>
          </TabsList>
          {[['pending', pending], ['accepted', accepted], ['rejected', rejected]].map(([tab, list]) => (
            <TabsContent key={tab} value={tab}>
              {list.length === 0 ? <p className="text-center py-10 text-muted-foreground text-sm">No {tab} posts.</p> : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">{list.map(p => <PostCard key={p.id} post={p} />)}</div>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {editPost && (
        <EditPostDialog post={editPost} canvases={canvases} open={!!editPost} brand={brand} tone={tone}
          onClose={() => setEditPost(null)}
          onSave={async (newData) => { await onRerender(editPost.id, newData); setEditPost(null) }} />
      )}
    </div>
  )
}

// ── Step 4: Schedule ──────────────────────────────────────────────────────
function StepSchedule({ flow, onUpdatePost }) {
  const accepted = (flow?.posts || []).filter(p => p.status === 'accepted')
  return (
    <div className="space-y-6">
      <div><h2 style={{ ...BEBAS, fontSize: 26 }}>SCHEDULE POSTS</h2>
      <p className="text-sm text-muted-foreground mt-1">Set a date and time for each accepted post.</p></div>
      {accepted.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accepted posts yet</p>
          <p className="text-sm mt-1">Accept posts in the Generate step first.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {accepted.map(post => (
            <div key={post.id} className="flex items-center gap-4 rounded-xl border-2 border-foreground/15 p-3 bg-card">
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {post.render?.url && post.canvasType !== 'carousel'
                  ? <img src={post.render.url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><Layers className="w-5 h-5 text-muted-foreground/40" /></div>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{post.canvasName}</p>
                {Object.entries(post.data || {}).filter(([, v]) => typeof v === 'string' && !v.startsWith('http')).slice(0, 1).map(([k, v]) => (
                  <p key={k} className="text-[10px] text-muted-foreground truncate">"{v}"</p>
                ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input type="datetime-local" className="h-8 text-xs border-2 border-foreground/20 rounded-lg px-2 bg-background"
                  value={post.scheduledAt ? new Date(post.scheduledAt).toISOString().slice(0, 16) : ''}
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={e => onUpdatePost(post.id, { scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                {post.scheduledAt && <span className="text-[10px] text-[#9AB800] font-bold flex items-center gap-1"><Clock className="w-3 h-3" />Set</span>}
              </div>
            </div>
          ))}
          {accepted.filter(p => p.scheduledAt).length > 0 && (
            <div className="rounded-xl bg-[#D4FF00]/10 border-2 border-[#D4FF00] p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-[#9AB800] shrink-0" />
              <div>
                <p className="font-bold text-sm">{accepted.filter(p => p.scheduledAt).length} post{accepted.filter(p => p.scheduledAt).length !== 1 ? 's' : ''} scheduled</p>
                <p className="text-xs text-muted-foreground mt-0.5">Connect your Instagram account to enable auto-publishing.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Step 3: Content Ideas ─────────────────────────────────────────────────
function StepIdeas({ ideas, onSetIdeas, flowId }) {
  const [generating, setGenerating] = useState(false)
  const [custom, setCustom] = useState('')

  const generateIdeas = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/flows/${flowId}/generate-ideas`, { method: 'POST' })
      const data = await res.json()
      if (data.ideas && Array.isArray(data.ideas)) {
        const next = data.ideas.map(text => ({ id: Math.random().toString(36).slice(2), text, selected: true }))
        onSetIdeas(prev => {
          const seen = new Set(prev.map(i => i.text.toLowerCase()))
          return [...prev, ...next.filter(i => !seen.has(i.text.toLowerCase()))]
        })
        toast.success(`${data.ideas.length} ideas generated`)
      }
    } catch { toast.error('Failed to generate ideas') }
    finally { setGenerating(false) }
  }

  const toggle = id => onSetIdeas(prev => prev.map(i => i.id === id ? { ...i, selected: !i.selected } : i))
  const remove = id => onSetIdeas(prev => prev.filter(i => i.id !== id))
  const addCustom = () => {
    if (!custom.trim()) return
    onSetIdeas(prev => [...prev, { id: Math.random().toString(36).slice(2), text: custom.trim(), selected: true }])
    setCustom('')
  }

  const selectedCount = ideas.filter(i => i.selected !== false).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 26 }}>CONTENT IDEAS</h2>
        <p className="text-sm text-muted-foreground mt-1">AI brainstorms post angles from your brand context. Select the ones you like — each selected idea will guide the AI when generating your posts.</p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Button onClick={generateIdeas} disabled={generating}
          className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold">
          {generating
            ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Generating…</>
            : <><Sparkles className="w-4 h-4 mr-2" />{ideas.length > 0 ? 'Generate More Ideas' : 'Generate Ideas'}</>}
        </Button>
        {ideas.length > 0 && (
          <span className="text-sm text-muted-foreground">{selectedCount} of {ideas.length} selected</span>
        )}
      </div>

      {ideas.length === 0 && !generating && (
        <div className="text-center py-16 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ideas yet</p>
          <p className="text-sm mt-1">Click Generate Ideas to get AI-powered post angles based on your brand context.<br />You can also skip this step — the AI will write varied copy on its own.</p>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ideas.map(idea => (
            <div key={idea.id}
              className={`group relative rounded-xl border-2 p-4 cursor-pointer select-none transition-all ${
                idea.selected !== false
                  ? 'border-[#D4FF00] bg-[#D4FF00]/5'
                  : 'border-foreground/15 opacity-50 hover:opacity-70 hover:border-foreground/30'
              }`}
              onClick={() => toggle(idea.id)}>
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                  idea.selected !== false ? 'bg-[#D4FF00] border-[#D4FF00]' : 'border-foreground/25'
                }`}>
                  {idea.selected !== false && <Check className="w-3 h-3 text-foreground" />}
                </div>
                <p className="text-sm flex-1 leading-snug">{idea.text}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); remove(idea.id) }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 hover:text-destructive transition p-0.5">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-foreground/10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Add Your Own Idea</p>
        <div className="flex gap-2">
          <Input className="text-sm flex-1 border-2"
            placeholder="e.g. Share a behind-the-scenes look at our packaging process"
            value={custom}
            onChange={e => setCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCustom()} />
          <Button variant="outline" className="border-2 shrink-0" onClick={addCustom} disabled={!custom.trim()}>
            <Plus className="w-4 h-4 mr-1.5" />Add
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────
export default function FlowPage() {
  const router = useRouter()
  const [step, setStep]             = useState(1)
  const [maxStep, setMaxStep]       = useState(1)
  const [canvases, setCanvases]     = useState([])
  const [galleries, setGalleries]   = useState([])
  const [flows, setFlows]           = useState([])
  const [activeFlow, setActiveFlow] = useState(null)
  const [brand, setBrand]           = useState({})
  const [selectedCanvases, setSelectedCanvases] = useState([])
  const [galleryId, setGalleryId]   = useState(null)
  const [tone, setTone]             = useState('informative')
  const [generating, setGenerating] = useState(false)
  const [showList, setShowList]     = useState(true)
  const [newName, setNewName]       = useState('')
  const [contentIdeas, setContentIdeas] = useState([])

  const loadGalleries = () => fetch('/api/galleries').then(r => r.json()).then(d => setGalleries(Array.isArray(d) ? d : []))

  useEffect(() => {
    fetch('/api/canvases').then(r => r.json()).then(d => setCanvases(Array.isArray(d) ? d : []))
    fetch('/api/flows').then(r => r.json()).then(d => setFlows(Array.isArray(d) ? d : []))
    loadGalleries()
  }, [])

  const goTo = (n) => { if (n <= maxStep) setStep(n) }

  const saveFlow = async (extra = {}) => {
    if (!activeFlow) return
    const body = { ...activeFlow, brandContext: brand, selectedCanvases, galleryId, tone, contentIdeas, ...extra }
    const res = await fetch(`/api/flows/${activeFlow.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const saved = await res.json()
    setActiveFlow(saved)
    setFlows(prev => prev.map(f => f.id === saved.id ? saved : f))
    return saved
  }

  const advance = async () => {
    await saveFlow()
    const next = step + 1
    setStep(next)
    if (next > maxStep) setMaxStep(next)
  }

  const generate = async () => {
    const saved = await saveFlow()
    if (!saved) return
    setGenerating(true)
    try {
      const res = await fetch(`/api/flows/${saved.id}/generate`, { method: 'POST' })
      const data = await res.json()
      if (data.success) {
        const refreshed = await fetch(`/api/flows/${saved.id}`).then(r => r.json())
        setActiveFlow(refreshed)
        if (step < 4) { setStep(4); setMaxStep(prev => Math.max(prev, 5)) }
        toast.success(`${data.postCount} posts generated`)
      } else toast.error(data.error || 'Generation failed')
    } catch { toast.error('Generation failed') }
    finally { setGenerating(false) }
  }

  const updatePost = async (postId, patch) => {
    if (!activeFlow) return
    await fetch(`/api/flows/${activeFlow.id}/posts/${postId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) })
    const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then(r => r.json())
    setActiveFlow(refreshed)
  }

  const rerenderPost = async (postId, newData) => {
    if (!activeFlow) return
    const res = await fetch(`/api/flows/${activeFlow.id}/rerender-post`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ postId, data: newData }) })
    const result = await res.json()
    if (result.success) {
      const refreshed = await fetch(`/api/flows/${activeFlow.id}`).then(r => r.json())
      setActiveFlow(refreshed); toast.success('Post updated')
    }
  }

  const createFlow = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/flows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName.trim() }) })
    const flow = await res.json()
    setFlows(prev => [flow, ...prev])
    setActiveFlow(flow); setBrand({}); setSelectedCanvases([]); setGalleryId(null); setTone('informative'); setContentIdeas([])
    setStep(1); setMaxStep(1); setNewName(''); setShowList(false)
  }

  const openFlow = (flow) => {
    setActiveFlow(flow); setBrand(flow.brandContext || {}); setSelectedCanvases(flow.selectedCanvases || [])
    setGalleryId(flow.galleryId || null); setTone(flow.tone || 'informative')
    setContentIdeas(flow.contentIdeas || [])
    const ms = flow.posts?.length > 0 ? 5 : (flow.selectedCanvases?.length > 0 ? 4 : 2)
    setMaxStep(ms); setStep(flow.posts?.length > 0 ? 4 : 2); setShowList(false)
  }

  const canAdvance = () => {
    if (step === 1) return true
    if (step === 2) return selectedCanvases.length > 0
    if (step === 3) return true // Ideas step is optional
    if (step === 4) return (activeFlow?.posts || []).some(p => p.status === 'accepted')
    return false
  }

  // ── Flow list ─────────────────────────────────────────────────────────
  if (showList) {
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
          <div>
            <h1 style={{ ...BEBAS, fontSize: 'clamp(36px, 6vw, 72px)', lineHeight: 0.9 }}>AUTOMATE YOUR<br /><span style={{ color: '#9AB800' }}>INSTAGRAM FEED.</span></h1>
            <p className="mt-4 text-foreground/70 max-w-xl">Give context about your brand, pick layouts, and let the AI do the rest — copy, images, and scheduling in one flow.</p>
          </div>
          <div className="flex gap-3">
            <Input placeholder="Name your flow (e.g. Weekly Product Posts)" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && createFlow()} className="max-w-sm border-2 border-foreground/20" />
            <Button onClick={createFlow} disabled={!newName.trim()} className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold">
              <Plus className="w-4 h-4 mr-1.5" />New Flow
            </Button>
          </div>
          {flows.length > 0 && (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-3">Your Flows</p>
              <div className="space-y-2">
                {flows.map(flow => (
                  <div key={flow.id} className="flex items-center gap-4 p-4 rounded-xl border-2 border-foreground/15 bg-card hover:border-foreground/40 transition cursor-pointer group" onClick={() => openFlow(flow)}>
                    <div className="w-10 h-10 rounded-lg bg-[#D4FF00]/20 border border-[#D4FF00]/40 flex items-center justify-center shrink-0"><Zap className="w-5 h-5 text-[#9AB800]" /></div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold truncate">{flow.name}</p>
                      <p className="text-[11px] text-muted-foreground">{(flow.selectedCanvases || []).length} layouts · {(flow.posts || []).length} posts · {(flow.posts || []).filter(p => p.status === 'accepted').length} accepted</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${flow.status === 'ready' ? 'border-[#9AB800] text-[#9AB800]' : 'border-foreground/20 text-foreground/40'}`}>{flow.status || 'draft'}</span>
                    <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition" />
                    <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive hover:text-destructive-foreground opacity-0 group-hover:opacity-100 shrink-0"
                      onClick={async e => { e.stopPropagation(); if (!confirm('Delete flow?')) return; await fetch(`/api/flows/${flow.id}`, { method: 'DELETE' }); setFlows(prev => prev.filter(f => f.id !== flow.id)) }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── Active flow ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#0E0D0B] text-foreground flex flex-col">
      <header className="border-b-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] sticky top-0 z-20 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => { saveFlow(); setShowList(true) }}><ArrowLeft className="w-4 h-4" /></Button>
        <KandLogo size={26} />
        <span className="font-bold text-sm truncate max-w-36">{activeFlow?.name}</span>
        <div className="flex-1 flex justify-center"><StepBar step={step} maxStep={maxStep} onGoTo={goTo} /></div>
        <ThemeToggle />
      </header>

      <div className="flex-1 max-w-6xl w-full mx-auto px-6 py-8">
        {step === 1 && <StepBrand brand={brand} onChange={setBrand} />}
        {step === 2 && <StepConfigure canvases={canvases} selectedCanvases={selectedCanvases} onToggleCanvas={id => setSelectedCanvases(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])} galleryId={galleryId} onSetGallery={setGalleryId} tone={tone} onSetTone={setTone} galleries={galleries} onRefreshGalleries={loadGalleries} />}
        {step === 3 && <StepIdeas ideas={contentIdeas} onSetIdeas={setContentIdeas} flowId={activeFlow?.id} />}
        {step === 4 && <StepGenerate flow={activeFlow} canvases={canvases} onGenerate={generate} onUpdatePost={updatePost} onRerender={rerenderPost} generating={generating} brand={brand} tone={tone} />}
        {step === 5 && <StepSchedule flow={activeFlow} onUpdatePost={updatePost} />}
      </div>

      <div className="sticky bottom-0 border-t-2 border-foreground/90 bg-[#FAF7F2] dark:bg-[#0E0D0B] px-6 py-3 flex items-center justify-between">
        <Button variant="outline" className="border-2" onClick={() => step > 1 ? setStep(s => s - 1) : (saveFlow(), setShowList(true))}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />{step === 1 ? 'Flows' : 'Back'}
        </Button>
        <span className="text-[11px] text-muted-foreground hidden sm:block">
          {step === 1 && 'Brand context is used by the AI for all copy generation'}
          {step === 2 && `${selectedCanvases.length} layout${selectedCanvases.length !== 1 ? 's' : ''} selected · ${tone} tone`}
          {step === 3 && `${contentIdeas.filter(i => i.selected !== false).length} idea${contentIdeas.filter(i => i.selected !== false).length !== 1 ? 's' : ''} selected`}
          {step === 4 && `${(activeFlow?.posts || []).filter(p => p.status === 'accepted').length} posts accepted`}
          {step === 5 && `${(activeFlow?.posts || []).filter(p => p.scheduledAt).length} posts scheduled`}
        </span>
        {step < 5 ? (
          <Button disabled={!canAdvance()}
            className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold"
            onClick={async () => { if (step === 4) { await saveFlow(); setStep(5); setMaxStep(prev => Math.max(prev, 5)) } else await advance() }}>
            Continue <ArrowRight className="w-4 h-4 ml-1.5" />
          </Button>
        ) : (
          <Button disabled={(activeFlow?.posts || []).filter(p => p.scheduledAt).length === 0}
            onClick={async () => { await saveFlow(); toast.success('Flow saved! Posts scheduled.') }}
            className="bg-[#D4FF00] text-foreground hover:bg-[#D4FF00]/80 rounded-full px-6 font-semibold">
            <CheckCircle className="w-4 h-4 mr-1.5" />Confirm Schedule
          </Button>
        )}
      </div>
    </div>
  )
}
