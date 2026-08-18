'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Pencil, Save, Sparkles, RefreshCw, ImageIcon, Type } from 'lucide-react'
import { toast } from 'sonner'

export function EditPostDialog({
  post,
  canvases,
  open,
  onClose,
  onSave,
  brand,
  tone,
}) {
  const [data, setData] = useState({})
  const [caption, setCaption] = useState('')
  const [regen, setRegen] = useState({})
  const canvas = canvases.find((c) => c.id === post?.canvasId)

  useEffect(() => {
    if (post) {
      setData({ ...post.data })
      setCaption(post.caption || '')
    }
  }, [post?.id])

  const allNodes = canvas
    ? [
        ...(canvas.nodes || []),
        ...(canvas.pages || []).flatMap((p) => p.nodes || []),
      ].filter((n) => n.dynamic_key)
    : []

  const regenKey = async (key) => {
    setRegen((r) => ({ ...r, [key]: true }))
    try {
      const brandCtx = [
        brand?.businessName,
        brand?.description,
        brand?.audience,
        brand?.voice,
      ]
        .filter(Boolean)
        .join('. ')
      const classNames = Object.keys(canvas?.classes || {}).join(', ')
      const res = await fetch('/api/ai-copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key,
          topic: key,
          brandContext: brandCtx,
          tone: tone || 'informative',
          classContext: classNames ? `Classes: ${classNames}` : '',
        }),
      })
      const result = await res.json()
      if (result.text) setData((d) => ({ ...d, [key]: result.text }))
    } catch {
      toast.error('Regeneration failed')
    } finally {
      setRegen((r) => ({ ...r, [key]: false }))
    }
  }

  if (!post) return null

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <p className="font-bold flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            Edit Post — {post.canvasName}
          </p>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2 border-b border-foreground/10 pb-4">
            <Label className="text-xs font-semibold">Instagram Caption</Label>
            <Textarea
              rows={4}
              className="text-sm"
              placeholder="Write the Instagram caption for this post..."
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
            />
            <p className="text-[9px] text-muted-foreground">{caption.length} characters</p>
          </div>

          <div className="space-y-3 max-h-96 overflow-y-auto">
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
              Content Fields
            </p>
            {allNodes.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">
                No dynamic fields in this canvas.
              </p>
            ) : (
              allNodes.map((node) => {
                const key = node.dynamic_key
                return (
                  <div
                    key={key}
                    className="rounded-lg border border-foreground/10 p-3 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      {node.type === 'image' ? (
                        <ImageIcon className="w-3 h-3 text-muted-foreground" />
                      ) : (
                        <Type className="w-3 h-3 text-muted-foreground" />
                      )}
                      <code className="text-xs font-mono font-bold">{`{${key}}`}</code>
                      {node.type === 'text' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 text-[10px] ml-auto"
                          disabled={regen[key]}
                          onClick={() => regenKey(key)}
                        >
                          {regen[key] ? (
                            <RefreshCw className="w-3 h-3 animate-spin mr-1" />
                          ) : (
                            <Sparkles className="w-3 h-3 mr-1" />
                          )}
                          Regen
                        </Button>
                      )}
                    </div>
                    {node.type === 'image' ? (
                      <div className="space-y-1.5">
                        {data[key] && (
                          <img
                            src={data[key]}
                            alt=""
                            className="h-20 rounded object-cover border border-foreground/10"
                            onError={(e) => {
                              e.target.style.display = 'none'
                            }}
                          />
                        )}
                        <Input
                          className="h-8 text-xs"
                          placeholder="Image URL"
                          value={data[key] || ''}
                          onChange={(e) =>
                            setData((d) => ({ ...d, [key]: e.target.value }))
                          }
                        />
                      </div>
                    ) : (
                      <Textarea
                        rows={3}
                        className="text-xs"
                        placeholder="Enter text content..."
                        value={data[key] || ''}
                        onChange={(e) =>
                          setData((d) => ({ ...d, [key]: e.target.value }))
                        }
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
        <div className="flex gap-2 pt-2 border-t border-foreground/10">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={() => onSave({ ...data, caption })}>
            <Save className="w-4 h-4 mr-1.5" />
            Save & Re-render
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
