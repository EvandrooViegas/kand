'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Plus, Trash2, RefreshCw, Upload, FolderOpen } from 'lucide-react'
import { toast } from 'sonner'

export function GalleryManager({ galleries, onRefresh }) {
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState(null)
  const [newUrl, setNewUrl] = useState('')
  const fileRef = useRef(null)
  const [uploading, setUploading] = useState(false)

  const createGallery = async () => {
    if (!newName.trim()) return
    const res = await fetch('/api/galleries', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim() }),
    })
    const g = await res.json()
    setNewName('')
    onRefresh()
    setSelected(g.id)
  }

  const gallery = galleries.find((g) => g.id === selected)

  const addUrl = async () => {
    if (!newUrl.trim() || !gallery) return
    await fetch(`/api/galleries/${gallery.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...gallery,
        images: [...gallery.images, newUrl.trim()],
      }),
    })
    setNewUrl('')
    onRefresh()
  }

  const removeImg = async (idx) => {
    if (!gallery) return
    await fetch(`/api/galleries/${gallery.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...gallery,
        images: gallery.images.filter((_, i) => i !== idx),
      }),
    })
    onRefresh()
  }

  const uploadFile = async (file) => {
    if (!file || !gallery) return
    setUploading(true)
    try {
      const reader = new FileReader()
      const dataUrl = await new Promise((res, rej) => {
        reader.onload = () => res(reader.result)
        reader.onerror = rej
        reader.readAsDataURL(file)
      })
      const r = await fetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: dataUrl }),
      })
      const result = await r.json()
      if (result.url) {
        await fetch(`/api/galleries/${gallery.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...gallery,
            images: [...gallery.images, result.url],
          }),
        })
        onRefresh()
        toast.success('Uploaded')
      }
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const deleteGallery = async (id) => {
    if (!confirm('Delete this gallery?')) return
    await fetch(`/api/galleries/${id}`, { method: 'DELETE' })
    if (selected === id) setSelected(null)
    onRefresh()
  }

  return (
    <div className="flex gap-4 h-[460px]">
      <div className="w-44 shrink-0 border-r border-foreground/10 pr-4 flex flex-col gap-2">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Galleries
        </p>
        <div className="flex gap-1">
          <Input
            className="h-7 text-xs flex-1"
            placeholder="New gallery…"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && createGallery()}
          />
          <Button size="icon" variant="outline" className="h-7 w-7" onClick={createGallery}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1">
          {galleries.map((g) => (
            <div
              key={g.id}
              className={`flex items-center gap-1 px-2 py-1.5 rounded-lg cursor-pointer group transition ${
                selected === g.id
                  ? 'bg-[#D4FF00]/20 font-semibold'
                  : 'hover:bg-muted'
              }`}
              onClick={() => setSelected(g.id)}
            >
              <FolderOpen className="w-3 h-3 text-muted-foreground shrink-0" />
              <span className="text-xs flex-1 truncate">{g.name}</span>
              <span className="text-[9px] text-muted-foreground">{g.images.length}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteGallery(g.id)
                }}
                className="opacity-0 group-hover:opacity-100 hover:text-destructive transition"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {!gallery ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select or create a gallery
          </div>
        ) : (
          <>
            <p className="text-sm font-bold">
              {gallery.name}{' '}
              <span className="font-normal text-muted-foreground">
                ({gallery.images.length} images)
              </span>
            </p>
            <div className="flex gap-2">
              <Input
                className="h-7 text-xs flex-1"
                placeholder="https://image.url"
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addUrl()}
              />
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addUrl}>
                Add URL
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <Upload className="w-3 h-3" />
                )}
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  Array.from(e.target.files || []).forEach((f) => uploadFile(f))
                  e.target.value = ''
                }}
              />
            </div>
            <div className="flex-1 overflow-y-auto grid grid-cols-4 gap-2 content-start">
              {gallery.images.length === 0 ? (
                <div className="col-span-4 flex items-center justify-center h-24 border-2 border-dashed border-foreground/15 rounded-xl text-muted-foreground text-sm">
                  Add images above
                </div>
              ) : (
                gallery.images.map((url, i) => (
                  <div
                    key={i}
                    className="relative group aspect-square rounded-lg overflow-hidden border border-foreground/10"
                  >
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImg(i)}
                      className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      <Trash2 className="w-4 h-4 text-white" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
