'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

export default function FlowPage() {
  const router = useRouter()
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadFlows()
  }, [])

  const loadFlows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/flows')
      const data = await res.json()
      setFlows(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error('Failed to load flows')
    } finally {
      setLoading(false)
    }
  }

  const startNewFlow = async () => {
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Campaign' }),
      })
      const flow = await res.json()
      router.push(`/flow/${flow.id}`)
    } catch (e) {
      toast.error('Failed to create flow')
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Flow</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">Instagram posts generator</p>
          </div>
          <Button
            onClick={startNewFlow}
            className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-5 h-10 font-medium"
          >
            <Plus className="w-4 h-4 mr-2" />
            New Campaign
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-6 py-12">
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : flows.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-slate-600 dark:text-slate-400 mb-6">No campaigns yet. Start creating!</p>
            <Button
              onClick={startNewFlow}
              className="bg-slate-900 hover:bg-slate-800 dark:bg-slate-50 dark:hover:bg-slate-200 dark:text-slate-900 text-white rounded-lg px-6 h-10 font-medium"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Campaign
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() => router.push(`/flow/${flow.id}`)}
                className="w-full p-4 text-left border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-900 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-900 dark:text-slate-50">
                      {flow.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {flow.businessContext?.name ? 'Configured' : 'Not configured'}
                    </p>
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(flow.updatedAt).toLocaleDateString()}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
