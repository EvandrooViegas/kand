'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus, Image as ImageIcon, Trash2, Pencil, Sparkles, Copy } from 'lucide-react'
import { toast } from 'sonner'

function buildGradientCssClient(node) {
  const stops = (node.stops || [{ color: '#6366f1', position: 0 }, { color: '#ec4899', position: 100 }])
    .slice()
    .sort((a, b) => (a.position || 0) - (b.position || 0))
    .map((s) => `${s.color} ${s.position || 0}%`)
    .join(', ')
  if (node.gradientType === 'radial') return `radial-gradient(circle at center, ${stops})`
  const angle = typeof node.angle === 'number' ? node.angle : 90
  return `linear-gradient(${angle}deg, ${stops})`
}

function CanvasPreview({ canvas }) {
  const w = canvas.width || 1080
  const scale = 280 / w
  return (
    <div className="absolute inset-0 overflow-hidden" style={{ background: canvas.background || '#fff' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: w, height: canvas.height || 1080, position: 'relative' }}>
        {(canvas.nodes || []).map((n) => {
          const baseStyle = {
            position: 'absolute', left: n.x, top: n.y, width: n.width, height: n.height,
            display: 'flex', alignItems: 'center',
            justifyContent: n.textAlign === 'center' ? 'center' : n.textAlign === 'right' ? 'flex-end' : 'flex-start',
            overflow: 'hidden',
          }
          let style = baseStyle
          if (n.type === 'text') {
            style = { ...baseStyle, color: n.color || '#000', fontSize: n.fontSize || 48, fontWeight: n.fontWeight || 400, fontFamily: `'${n.fontFamily || 'Inter'}', sans-serif` }
          } else if (n.type === 'shape') {
            style = { ...baseStyle, background: n.fill || '#6366f1',
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0),
              border: n.strokeWidth ? `${n.strokeWidth}px solid ${n.stroke || '#000'}` : 'none' }
          } else if (n.type === 'gradient') {
            style = { ...baseStyle, backgroundImage: buildGradientCssClient(n),
              borderRadius: n.shape === 'ellipse' ? Math.max(n.width, n.height) : (n.borderRadius || 0) }
          }
          return (
            <div key={n.id} style={style}>
              {n.type === 'text' ? (n.text || '') : n.type === 'image' && n.src ? (
                <img src={n.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
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
      toast.error('Failed to load canvases')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const createCanvas = async () => {
    try {
      const res = await fetch('/api/canvases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || 'Untitled Canvas' }),
      })
      const c = await res.json()
      setOpen(false)
      setName('')
      router.push(`/editor/${c.id}`)
    } catch (e) {
      toast.error('Create failed')
    }
  }

  const deleteCanvas = async (id) => {
    if (!confirm('Delete this canvas?')) return
    await fetch(`/api/canvases/${id}`, { method: 'DELETE' })
    toast.success('Canvas deleted')
    load()
  }

  const duplicateCanvas = async (id) => {
    try {
      const res = await fetch(`/api/canvases/${id}/duplicate`, { method: 'POST' })
      if (res.ok) {
        toast.success('Canvas duplicated')
        load()
      } else {
        toast.error('Duplicate failed')
      }
    } catch (e) {
      toast.error('Duplicate failed')
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-white sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-pink-500 via-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold tracking-tight">DynaCanvas</span>
              <p className="text-xs text-muted-foreground -mt-0.5">Dynamic Instagram posts via API</p>
            </div>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                New Canvas
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create a new canvas</DialogTitle>
              </DialogHeader>
              <Input
                placeholder="My new design"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && createCanvas()}
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createCanvas}>Create</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="container max-w-6xl mx-auto py-10 px-4">
        <h1 className="text-3xl font-bold mb-2 tracking-tight">Your Canvases</h1>
        <p className="text-muted-foreground mb-8">Design templates with dynamic placeholders. Render them with any data via a simple HTTP request.</p>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="aspect-square bg-muted animate-pulse rounded-lg" />
            ))}
          </div>
        ) : canvases.length === 0 ? (
          <div className="border-2 border-dashed rounded-xl p-16 text-center bg-white">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-100 to-purple-100 mx-auto mb-4 flex items-center justify-center">
              <ImageIcon className="w-7 h-7 text-purple-600" />
            </div>
            <p className="font-medium mb-1">No canvases yet</p>
            <p className="text-sm text-muted-foreground mb-5">Create your first dynamic Instagram post template.</p>
            <Button onClick={() => setOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first canvas
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {canvases.map((c) => (
              <Card key={c.id} className="overflow-hidden group hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5">
                <div
                  className="aspect-square bg-slate-50 relative cursor-pointer overflow-hidden"
                  onClick={() => router.push(`/editor/${c.id}`)}
                >
                  <CanvasPreview canvas={c} />
                </div>
                <CardContent className="p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate text-sm">{c.name}</h3>
                    <p className="text-xs text-muted-foreground">
                      {(c.nodes || []).length} elements
                    </p>
                  </div>
                  <div className="flex gap-0.5">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => router.push(`/editor/${c.id}`)} title="Edit">
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => duplicateCanvas(c.id)} title="Duplicate">
                      <Copy className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => deleteCanvas(c.id)} title="Delete">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default Dashboard
