'use client'

import { Calendar, Layers, Clock, CheckCircle } from 'lucide-react'
import { BEBAS } from '../constants'

export function StepSchedule({ flow, onUpdatePost }) {
  const accepted = (flow?.posts || []).filter((p) => p.status === 'accepted')

  return (
    <div className="space-y-6">
      <div>
        <h2 style={{ ...BEBAS, fontSize: 26 }}>SCHEDULE POSTS</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Set a date and time for each accepted post.
        </p>
      </div>
      {accepted.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-foreground/15 rounded-2xl text-muted-foreground">
          <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No accepted posts yet</p>
          <p className="text-sm mt-1">Accept posts in the Generate step first.</p>
        </div>
      ) : (
        <div className="space-y-3 max-w-2xl">
          {accepted.map((post) => (
            <div
              key={post.id}
              className="flex items-center gap-4 rounded-xl border-2 border-foreground/15 p-3 bg-card"
            >
              <div className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0">
                {post.render?.url && post.canvasType !== 'carousel' ? (
                  <img src={post.render.url} alt="" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Layers className="w-5 h-5 text-muted-foreground/40" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{post.canvasName}</p>
                {Object.entries(post.data || {})
                  .filter(([, v]) => typeof v === 'string' && !v.startsWith('http'))
                  .slice(0, 1)
                  .map(([k, v]) => (
                    <p key={k} className="text-[10px] text-muted-foreground truncate">
                      "{v}"
                    </p>
                  ))}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <input
                  type="datetime-local"
                  className="h-8 text-xs border-2 border-foreground/20 rounded-lg px-2 bg-background"
                  value={
                    post.scheduledAt
                      ? new Date(post.scheduledAt).toISOString().slice(0, 16)
                      : ''
                  }
                  min={new Date().toISOString().slice(0, 16)}
                  onChange={(e) =>
                    onUpdatePost(post.id, {
                      scheduledAt: e.target.value
                        ? new Date(e.target.value).toISOString()
                        : null,
                    })
                  }
                />
                {post.scheduledAt && (
                  <span className="text-[10px] text-[#9AB800] font-bold flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Set
                  </span>
                )}
              </div>
            </div>
          ))}
          {accepted.filter((p) => p.scheduledAt).length > 0 && (
            <div className="rounded-xl bg-[#D4FF00]/10 border-2 border-[#D4FF00] p-4 flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-[#9AB800] shrink-0" />
              <div>
                <p className="font-bold text-sm">
                  {accepted.filter((p) => p.scheduledAt).length} post
                  {accepted.filter((p) => p.scheduledAt).length !== 1 ? 's' : ''} scheduled
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Connect your Instagram account to enable auto-publishing.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
