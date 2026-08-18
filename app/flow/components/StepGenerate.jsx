'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Sparkles, RefreshCw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { GenerationProgress } from './GenerationProgress'
import { PostViewerModal } from './PostViewerModal'
import { EditPostDialog } from './EditPostDialog'
import { PostCard } from './PostCard'
import { BEBAS } from '../constants'

export function StepGenerate({
  flow,
  canvases,
  onGenerate,
  onUpdatePost,
  onRerender,
  generating,
  brand,
  tone,
  language,
  activeFlow,
}) {
  const posts = (flow?.posts || []).filter((p) => p.status !== 'deleted')
  const [editPost, setEditPost] = useState(null)
  const [viewPost, setViewPost] = useState(null)
  const [selectedPostIds, setSelectedPostIds] = useState(new Set())
  const pending = posts.filter((p) => p.status === 'pending')
  const accepted = posts.filter((p) => p.status === 'accepted')

  const togglePostSelection = (postId) => {
    const newSelected = new Set(selectedPostIds)
    if (newSelected.has(postId)) {
      newSelected.delete(postId)
    } else {
      newSelected.add(postId)
    }
    setSelectedPostIds(newSelected)
  }

  const selectAllInTab = (tabPosts) => {
    if (selectedPostIds.size === tabPosts.length && tabPosts.every(p => selectedPostIds.has(p.id))) {
      setSelectedPostIds(new Set())
    } else {
      setSelectedPostIds(new Set(tabPosts.map(p => p.id)))
    }
  }

  const deleteBulk = async () => {
    if (selectedPostIds.size === 0) return
    if (!confirm(`Delete ${selectedPostIds.size} post${selectedPostIds.size > 1 ? 's' : ''}?`)) return
    
    for (const postId of selectedPostIds) {
      await onUpdatePost(postId, { status: 'deleted' })
    }
    setSelectedPostIds(new Set())
    toast.success(`${selectedPostIds.size} post${selectedPostIds.size > 1 ? 's' : ''} deleted`)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 style={{ ...BEBAS, fontSize: 26 }}>YOUR POSTS</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate 3 at a time. Review, tweak, then send them to the schedule.
          </p>
        </div>
        <Button
          onClick={onGenerate}
          disabled={generating}
          className="bg-[#D4FF00] text-foreground hover:bg-[#D4FF00]/80 font-bold rounded-full px-6"
        >
          {generating ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Working…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              {posts.length > 0 ? 'Generate 3 more' : 'Generate 3 posts'}
            </>
          )}
        </Button>
      </div>

      {generating && <GenerationProgress flowId={activeFlow?.id} />}

      {posts.length === 0 && !generating && (
        <div className="text-center py-20 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground animate-in fade-in duration-300">
          <Sparkles className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Ready when you are</p>
          <p className="text-sm mt-1">
            Hit the button above. You will get 3 posts — each with copy tailored to one of your
            chosen angles.
          </p>
        </div>
      )}

      {posts.length > 0 && (
        <Tabs defaultValue="pending">
          <div className="flex items-center justify-between gap-3 mb-4">
            <TabsList className="border-2 border-foreground/15 bg-card">
              <TabsTrigger
                value="pending"
                className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider"
              >
                Review ({pending.length})
              </TabsTrigger>
              <TabsTrigger
                value="accepted"
                className="data-[state=active]:bg-[#D4FF00] data-[state=active]:text-foreground text-xs font-bold uppercase tracking-wider"
              >
                Accepted ({accepted.length})
              </TabsTrigger>
            </TabsList>
            
            {selectedPostIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground/70">
                  {selectedPostIds.size} selected
                </span>
                <Button
                  onClick={deleteBulk}
                  variant="ghost"
                  className="h-8 px-3 text-destructive hover:bg-destructive/10 text-xs font-bold gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete All
                </Button>
              </div>
            )}
          </div>
          {[
            ['pending', pending],
            ['accepted', accepted],
          ].map(([tab, list]) => (
            <TabsContent key={tab} value={tab} className="space-y-4">
              {list.length === 0 ? (
                <p className="text-center py-10 text-muted-foreground text-sm">No {tab} posts.</p>
              ) : (
                <>
                  <div className="flex items-center gap-3 mb-4">
                    <button
                      onClick={() => selectAllInTab(list)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground transition"
                    >
                      {selectedPostIds.size === list.length && list.length > 0 ? 'Deselect all' : 'Select all'} ({list.length})
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {list.map((p) => (
                      <div key={p.id} className="relative">
                        <PostCard
                          post={p}
                          onView={() => setViewPost(p)}
                          onEdit={() => setEditPost(p)}
                          onDelete={(id) => {
                            if (confirm('Delete this post?')) {
                              onUpdatePost(id, { status: 'deleted' })
                            }
                          }}
                          onAccept={(id) => onUpdatePost(id, { status: 'accepted' })}
                        />
                        <label className="absolute top-3 left-3 flex items-center gap-2 cursor-pointer z-10">
                          <input
                            type="checkbox"
                            checked={selectedPostIds.has(p.id)}
                            onChange={() => togglePostSelection(p.id)}
                            className="w-4 h-4 rounded border-2 border-foreground/30 accent-[#D4FF00] cursor-pointer"
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </TabsContent>
          ))}
        </Tabs>
      )}

      {viewPost && (
        <PostViewerModal
          post={viewPost}
          canvases={canvases}
          open={!!viewPost}
          onClose={() => setViewPost(null)}
        />
      )}

      {editPost && (
        <EditPostDialog
          post={editPost}
          canvases={canvases}
          open={!!editPost}
          brand={brand}
          tone={tone}
          onClose={() => setEditPost(null)}
          onSave={async (newData) => {
            await onRerender(editPost.id, newData)
            setEditPost(null)
          }}
        />
      )}
    </div>
  )
}
