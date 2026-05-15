'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  ArrowLeft,
  Type,
  Image as ImageIcon,
  Trash2,
  Save,
  Play,
  Code2,
  Copy,
  Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { v4 as uuidv4 } from 'uuid'

function Editor() {
  const router = useRouter()
  const params = useParams()
  const id = params.id
  const [canvas, setCanvas] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [scale, setScale] = useState(0.5)
  const canvasRef = useRef(null)
  const [renderDialog, setRenderDialog] = useState(false)
  const [renderData, setRenderData] = useState('')
  const [renderResult, setRenderResult] = useState(null)
  const [rendering, setRendering] = useState(false)
  const [apiDialog, setApiDialog] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    fetch(`/api/canvases/${id}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) {
          toast.error(data.error)
          router.push('/')
        } else {
          setCanvas(data)
        }
      })
  }, [id])

  useEffect(() => {
    if (!canvas) return
    const updateScale = () => {
      const w = window.innerWidth - 700
      const h = window.innerHeight - 180
      const sx = w / canvas.width
      const sy = h / canvas.height
      setScale(Math.min(sx, sy, 0.7))
    }
    updateScale()
    window.addEventListener('resize', updateScale)
    return () => window.removeEventListener('resize', updateScale)
  }, [canvas?.width, canvas?.height])

  // Build default JSON for test renderer
  useEffect(() => {
    if (!canvas) return
    const sample = {}
    ;(canvas.nodes || []).forEach((n) => {
      if (n.dynamic_key) {
        sample[n.dynamic_key] = n.type === 'text' ? (n.text || 'Sample text') : (n.src || 'https://image.url')
      }
    })
    setRenderData(JSON.stringify({ canva_id: id, data: sample }, null, 2))
  }, [canvas?.id, canvas?.nodes?.length, renderDialog])

  const selected = canvas?.nodes?.find((n) => n.id === selectedId)

  const updateNode = (nodeId, patch) => {
    setCanvas((c) => ({ ...c, nodes: c.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)) }))
  }

  const deleteNode = (nodeId) => {
    setCanvas((c) => ({ ...c, nodes: c.nodes.filter((n) => n.id !== nodeId) }))
    setSelectedId(null)
  }

  const addText = () => {
    const newNode = {
      id: uuidv4(),
      type: 'text',
      x: Math.round((canvas.width - 600) / 2),
      y: Math.round((canvas.height - 100) / 2),
      width: 600,
      height: 100,
      text: 'New text',
      fontSize: 72,
      fontWeight: 700,
      color: '#111111',
      textAlign: 'center',
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedId(newNode.id)
  }

  const addImage = () => {
    const src = prompt('Image URL:', 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800')
    if (!src) return
    const newNode = {
      id: uuidv4(),
      type: 'image',
      x: Math.round((canvas.width - 500) / 2),
      y: Math.round((canvas.height - 500) / 2),
      width: 500,
      height: 500,
      src,
    }
    setCanvas((c) => ({ ...c, nodes: [...(c.nodes || []), newNode] }))
    setSelectedId(newNode.id)
  }

  const save = async () => {
    if (!canvas) return
    try {
      const res = await fetch(`/api/canvases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canvas),
      })
      if (res.ok) toast.success('Saved!')
      else toast.error('Save failed')
    } catch (e) {
      toast.error('Save failed: ' + e.message)
    }
  }

  const testRender = async () => {
    setRendering(true)
    setRenderResult(null)
    try {
      const parsed = renderData.trim() ? JSON.parse(renderData) : { canva_id: id, data: {} }
      // Auto-save before rendering so changes are reflected
      await fetch(`/api/canvases/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(canvas),
      })
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canva_id: parsed.canva_id || id, data: parsed.data || {} }),
      })
      const r = await res.json()
      if (r.url) setRenderResult(r.url)
      else toast.error(r.error || 'Render failed')
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setRendering(false)
    }
  }

  const dragState = useRef(null)
  const handleMouseDown = (e, node, mode = 'move') => {
    e.stopPropagation()
    e.preventDefault()
    setSelectedId(node.id)
    dragState.current = {
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: node.x, y: node.y, width: node.width, height: node.height },
      mode,
    }
    const onMove = (e) => {
      const ds = dragState.current
      if (!ds) return
      const dx = (e.clientX - ds.startX) / scale
      const dy = (e.clientY - ds.startY) / scale
      if (ds.mode === 'move') {
        updateNode(ds.nodeId, { x: Math.round(ds.orig.x + dx), y: Math.round(ds.orig.y + dy) })
      } else if (ds.mode === 'resize') {
        updateNode(ds.nodeId, {
          width: Math.max(20, Math.round(ds.orig.width + dx)),
          height: Math.max(20, Math.round(ds.orig.height + dy)),
        })
      }
    }
    const onUp = () => {
      dragState.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  if (!canvas) {
    return (
      <div className="h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading canvas...</p>
      </div>
    )
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : ''

  return (
    <div className="h-screen flex flex-col bg-slate-50">
      {/* Top bar */}
      <div className="border-b bg-white px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/')}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            value={canvas.name}
            onChange={(e) => setCanvas({ ...canvas, name: e.target.value })}
            className="w-64 font-medium"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setApiDialog(true)}>
            <Code2 className="w-4 h-4 mr-2" />
            API
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRenderDialog(true)}>
            <Play className="w-4 h-4 mr-2" />
            Test Render
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left toolbar */}
        <div className="w-60 border-r bg-white p-3 flex flex-col">
          <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">Add Elements</p>
          <div className="space-y-1.5">
            <Button variant="outline" className="w-full justify-start" onClick={addText}>
              <Type className="w-4 h-4 mr-2" /> Add Text
            </Button>
            <Button variant="outline" className="w-full justify-start" onClick={addImage}>
              <ImageIcon className="w-4 h-4 mr-2" /> Add Image
            </Button>
          </div>
          <div className="mt-5 pt-4 border-t flex-1 min-h-0 flex flex-col">
            <p className="text-xs font-semibold uppercase text-muted-foreground mb-2 tracking-wide">Layers</p>
            <div className="flex-1 overflow-y-auto space-y-1">
              {(canvas.nodes || []).slice().reverse().map((n) => (
                <div
                  key={n.id}
                  onClick={() => setSelectedId(n.id)}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-sm ${
                    selectedId === n.id ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
                  }`}
                >
                  {n.type === 'text' ? <Type className="w-3.5 h-3.5" /> : <ImageIcon className="w-3.5 h-3.5" />}
                  <span className="truncate flex-1">
                    {n.dynamic_key
                      ? `{${n.dynamic_key}}`
                      : n.type === 'text'
                      ? (n.text || '').slice(0, 18) || 'Text'
                      : 'Image'}
                  </span>
                  {n.dynamic_key && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">DYN</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Canvas area */}
        <div
          className="flex-1 overflow-auto flex items-center justify-center p-6"
          style={{ background: 'repeating-conic-gradient(#e5e7eb 0% 25%, #f3f4f6 0% 50%) 50% / 24px 24px' }}
          onClick={() => setSelectedId(null)}
        >
          <div
            ref={canvasRef}
            className="relative shadow-2xl"
            style={{
              width: canvas.width * scale,
              height: canvas.height * scale,
              background: canvas.background || '#ffffff',
            }}
          >
            <div
              style={{
                width: canvas.width,
                height: canvas.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
                position: 'relative',
              }}
            >
              {(canvas.nodes || []).map((node) => (
                <div
                  key={node.id}
                  onMouseDown={(e) => handleMouseDown(e, node, 'move')}
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedId(node.id)
                  }}
                  style={{
                    position: 'absolute',
                    left: node.x,
                    top: node.y,
                    width: node.width,
                    height: node.height,
                    cursor: 'move',
                    outline: selectedId === node.id ? '3px solid #6366f1' : 'none',
                    outlineOffset: 2,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent:
                      node.textAlign === 'center'
                        ? 'center'
                        : node.textAlign === 'right'
                        ? 'flex-end'
                        : 'flex-start',
                    color: node.color || '#000000',
                    fontSize: node.fontSize || 48,
                    fontWeight: node.fontWeight || 400,
                    fontFamily: 'Inter, sans-serif',
                    overflow: 'hidden',
                    userSelect: 'none',
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {node.type === 'text' ? (
                    node.text || ''
                  ) : node.src ? (
                    <img
                      src={node.src}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      draggable={false}
                    />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: '#e5e7eb' }} />
                  )}
                  {selectedId === node.id && (
                    <div
                      onMouseDown={(e) => handleMouseDown(e, node, 'resize')}
                      style={{
                        position: 'absolute',
                        right: -8,
                        bottom: -8,
                        width: 20,
                        height: 20,
                        background: '#6366f1',
                        borderRadius: 4,
                        cursor: 'nwse-resize',
                        border: '2px solid white',
                      }}
                    />
                  )}
                  {node.dynamic_key && (
                    <div
                      style={{
                        position: 'absolute',
                        top: -28,
                        left: 0,
                        fontSize: 14,
                        color: '#fff',
                        background: '#6366f1',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontWeight: 500,
                        pointerEvents: 'none',
                        fontFamily: 'monospace',
                      }}
                    >
                      {`{${node.dynamic_key}}`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right panel */}
        <div className="w-80 border-l bg-white p-4 overflow-y-auto">
          {!selected ? (
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-3 tracking-wide">Canvas Settings</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Width</Label>
                    <Input
                      type="number"
                      value={canvas.width}
                      onChange={(e) => setCanvas({ ...canvas, width: parseInt(e.target.value) || 1080 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height</Label>
                    <Input
                      type="number"
                      value={canvas.height}
                      onChange={(e) => setCanvas({ ...canvas, height: parseInt(e.target.value) || 1080 })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Background</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      className="w-14 p-1 h-10"
                      value={canvas.background || '#ffffff'}
                      onChange={(e) => setCanvas({ ...canvas, background: e.target.value })}
                    />
                    <Input
                      value={canvas.background || '#ffffff'}
                      onChange={(e) => setCanvas({ ...canvas, background: e.target.value })}
                    />
                  </div>
                </div>
                <div className="pt-3 border-t mt-3">
                  <p className="text-xs text-muted-foreground">
                    Tip: Set a <span className="font-mono bg-muted px-1 rounded">dynamic_key</span> on any element to make it dynamic via the API.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wide">
                  {selected.type === 'text' ? 'Text' : 'Image'} Properties
                </p>
                <Button variant="ghost" size="icon" onClick={() => deleteNode(selected.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {selected.type === 'text' && (
                  <>
                    <div>
                      <Label className="text-xs">Text</Label>
                      <Textarea
                        value={selected.text || ''}
                        onChange={(e) => updateNode(selected.id, { text: e.target.value })}
                        rows={3}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Font Size</Label>
                        <Input
                          type="number"
                          value={selected.fontSize || 48}
                          onChange={(e) => updateNode(selected.id, { fontSize: parseInt(e.target.value) || 48 })}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Weight</Label>
                        <select
                          className="w-full h-10 border rounded-md px-3 text-sm bg-white"
                          value={selected.fontWeight || 400}
                          onChange={(e) => updateNode(selected.id, { fontWeight: parseInt(e.target.value) })}
                        >
                          <option value={400}>Regular</option>
                          <option value={700}>Bold</option>
                        </select>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Color</Label>
                      <div className="flex gap-2">
                        <Input
                          type="color"
                          className="w-14 p-1 h-10"
                          value={selected.color || '#000000'}
                          onChange={(e) => updateNode(selected.id, { color: e.target.value })}
                        />
                        <Input
                          value={selected.color || '#000000'}
                          onChange={(e) => updateNode(selected.id, { color: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Alignment</Label>
                      <select
                        className="w-full h-10 border rounded-md px-3 text-sm bg-white"
                        value={selected.textAlign || 'left'}
                        onChange={(e) => updateNode(selected.id, { textAlign: e.target.value })}
                      >
                        <option value="left">Left</option>
                        <option value="center">Center</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                  </>
                )}
                {selected.type === 'image' && (
                  <div>
                    <Label className="text-xs">Default Image URL</Label>
                    <Input
                      value={selected.src || ''}
                      onChange={(e) => updateNode(selected.id, { src: e.target.value })}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">X</Label>
                    <Input
                      type="number"
                      value={selected.x}
                      onChange={(e) => updateNode(selected.id, { x: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Y</Label>
                    <Input
                      type="number"
                      value={selected.y}
                      onChange={(e) => updateNode(selected.id, { y: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Width</Label>
                    <Input
                      type="number"
                      value={selected.width}
                      onChange={(e) => updateNode(selected.id, { width: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Height</Label>
                    <Input
                      type="number"
                      value={selected.height}
                      onChange={(e) => updateNode(selected.id, { height: parseInt(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                <div className="pt-3 border-t">
                  <Label className="text-xs flex items-center gap-2 mb-1">
                    Dynamic Key
                    <span className="text-[10px] text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Input
                    placeholder="e.g. text_1"
                    value={selected.dynamic_key || ''}
                    onChange={(e) => updateNode(selected.id, { dynamic_key: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Set this to make the element dynamic via the API. The value in the request body under{' '}
                    <span className="font-mono bg-muted px-1 rounded">data.{selected.dynamic_key || 'your_key'}</span> will replace this {selected.type}.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Test render dialog */}
      <Dialog open={renderDialog} onOpenChange={setRenderDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Test Dynamic Render</DialogTitle>
            <DialogDescription>
              Provide JSON matching your dynamic keys. Auto-saves canvas before rendering.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-xs mb-1">Request body (POST /api/render)</Label>
              <Textarea
                rows={14}
                className="font-mono text-xs"
                value={renderData}
                onChange={(e) => setRenderData(e.target.value)}
              />
              <Button onClick={testRender} disabled={rendering} className="mt-3 w-full">
                {rendering ? 'Rendering...' : 'Render'}
              </Button>
            </div>
            <div>
              <Label className="text-xs mb-1">Result</Label>
              <div className="aspect-square bg-slate-100 rounded border flex items-center justify-center overflow-hidden">
                {renderResult ? (
                  <img src={renderResult} alt="rendered" className="max-w-full max-h-full" />
                ) : (
                  <span className="text-xs text-muted-foreground">Render result will appear here</span>
                )}
              </div>
              {renderResult && (
                <div className="mt-2">
                  <p className="text-xs text-muted-foreground mb-1">Image URL:</p>
                  <a
                    href={renderResult}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary underline break-all"
                  >
                    {renderResult}
                  </a>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* API dialog */}
      <Dialog open={apiDialog} onOpenChange={setApiDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>API Usage</DialogTitle>
            <DialogDescription>Render this canvas dynamically via HTTP.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs mb-1">Endpoint</Label>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{`POST ${origin}/api/render`}</pre>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="text-xs">Request Body</Label>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    const body = JSON.stringify(
                      {
                        canva_id: id,
                        data: Object.fromEntries(
                          (canvas.nodes || [])
                            .filter((n) => n.dynamic_key)
                            .map((n) => [n.dynamic_key, n.type === 'text' ? 'your text' : 'https://example.com/image.png'])
                        ),
                      },
                      null,
                      2
                    )
                    navigator.clipboard.writeText(body)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </Button>
              </div>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(
                {
                  canva_id: id,
                  data: Object.fromEntries(
                    (canvas.nodes || [])
                      .filter((n) => n.dynamic_key)
                      .map((n) => [n.dynamic_key, n.type === 'text' ? 'your text' : 'https://example.com/image.png'])
                  ),
                },
                null,
                2
              )}</pre>
            </div>
            <div>
              <Label className="text-xs mb-1">Response</Label>
              <pre className="bg-slate-900 text-slate-100 p-3 rounded text-xs overflow-x-auto">{JSON.stringify(
                { url: `${origin}/api/rendered/<render_id>`, render_id: '<uuid>' },
                null,
                2
              )}</pre>
            </div>
            <p className="text-xs text-muted-foreground">
              The returned <span className="font-mono">url</span> serves the PNG directly. You can use it in img tags, share, etc.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default Editor
