'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import StepConfiguration from '../components/StepConfiguration'
import { toast } from 'sonner'

export default function FlowDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [flow, setFlow] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFlow()
  }, [params.id])

  const loadFlow = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/flows/${params.id}`)
      if (!res.ok) throw new Error('Flow not found')
      const data = await res.json()
      setFlow(data)
    } catch (e) {
      toast.error('Failed to load flow')
      router.push('/flow')
    } finally {
      setLoading(false)
    }
  }

  const updateFlow = async (updates) => {
    try {
      const res = await fetch(`/api/flows/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const updated = await res.json()
      setFlow(updated)
      return updated
    } catch (e) {
      toast.error('Failed to update flow')
      throw e
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-slate-950 flex items-center justify-center">
        <div className="text-slate-600 dark:text-slate-400">Loading...</div>
      </div>
    )
  }

  if (!flow) return null

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/flow')}
              className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            >
              ← Back
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 dark:text-slate-50">{flow.name}</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <StepConfiguration flow={flow} onUpdate={updateFlow} />
      </main>
    </div>
  )
}
