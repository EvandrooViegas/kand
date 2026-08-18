'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Check, Sparkles, Plus, X, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { BEBAS } from '../constants'

export function StepIdeas({
  ideas,
  onSetIdeas,
  flowId,
  brand,
  language,
}) {
  const [generating, setGenerating] = useState(false)
  const [custom, setCustom] = useState('')

  const generateIdeas = async () => {
    setGenerating(true)
    try {
      const res = await fetch(`/api/flows/${flowId}/generate-ideas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language, brand }),
      })
      const data = await res.json()
      if (data.ideas && Array.isArray(data.ideas)) {
        const next = data.ideas.map((text) => ({
          id: Math.random().toString(36).slice(2),
          text,
          selected: true,
        }))
        onSetIdeas((prev) => {
          const seen = new Set(prev.map((i) => i.text.toLowerCase()))
          return [...prev, ...next.filter((i) => !seen.has(i.text.toLowerCase()))]
        })
        toast.success(`${data.ideas.length} ideas generated`)
      }
    } catch {
      toast.error('Failed to generate ideas')
    } finally {
      setGenerating(false)
    }
  }

  const toggle = (id) =>
    onSetIdeas((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, selected: !i.selected } : i
      )
    )
  const remove = (id) => onSetIdeas((prev) => prev.filter((i) => i.id !== id))
  const addCustom = () => {
    if (!custom.trim()) return
    onSetIdeas((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), text: custom.trim(), selected: true },
    ])
    setCustom('')
  }

  const selectedCount = ideas.filter((i) => i.selected !== false).length

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 26 }}>CONTENT IDEAS</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Fresh angles based on your brand. Pick the ones you like — each selected idea will
          steer one of your posts.
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <Button
          onClick={generateIdeas}
          disabled={generating}
          className="bg-foreground text-background hover:bg-foreground/85 rounded-full px-6 font-semibold"
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {ideas.length > 0 ? 'Generate More Ideas' : 'Generate Ideas'}
            </>
          )}
        </Button>
        {ideas.length > 0 && (
          <span className="text-sm text-muted-foreground">
            {selectedCount} of {ideas.length} selected
          </span>
        )}
      </div>

      {ideas.length === 0 && !generating && (
        <div className="text-center py-16 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No ideas yet</p>
          <p className="text-sm mt-1">
            Click Generate Ideas to see fresh post angles based on your brand.
            <br />
            You can also skip this step — copy will still be crafted for you.
          </p>
        </div>
      )}

      {ideas.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ideas.map((idea) => (
            <div
              key={idea.id}
              className={`group relative rounded-xl border-2 p-4 cursor-pointer select-none transition-all ${
                idea.selected !== false
                  ? 'border-[#D4FF00] bg-[#D4FF00]/5'
                  : 'border-foreground/15 opacity-50 hover:opacity-70 hover:border-foreground/30'
              }`}
              onClick={() => toggle(idea.id)}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                    idea.selected !== false
                      ? 'bg-[#D4FF00] border-[#D4FF00]'
                      : 'border-foreground/25'
                  }`}
                >
                  {idea.selected !== false && (
                    <Check className="w-3 h-3 text-foreground" />
                  )}
                </div>
                <p className="text-sm flex-1 leading-snug">{idea.text}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  remove(idea.id)
                }}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 hover:text-destructive transition p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2 pt-2 border-t border-foreground/10">
        <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
          Add Your Own Idea
        </p>
        <div className="flex gap-2">
          <Input
            className="text-sm flex-1 border-2"
            placeholder="e.g. Share a behind-the-scenes look at our packaging process"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addCustom()}
          />
          <Button
            variant="outline"
            className="border-2 shrink-0"
            onClick={addCustom}
            disabled={!custom.trim()}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Add
          </Button>
        </div>
      </div>
    </div>
  )
}
