'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import { Plus, Workflow, Loader2, Wand2, Images, Sparkles } from 'lucide-react'
import BrandInfo from '@/components/BrandInfo'
import Creation from '@/components/Creation'
import Gallery from '@/components/Gallery'

const TABS = [
  { id: 'brand-info', label: 'Brand Information', icon: Sparkles },
  { id: 'creation',   label: 'Creation',          icon: Wand2    },
  { id: 'gallery',    label: 'Gallery',            icon: Images   },
]

export default function FlowPage() {
  const [flows, setFlows]               = useState([])
  const [loading, setLoading]           = useState(true)
  const [selectedFlow, setSelectedFlow] = useState(null)
  const [creatingFlow, setCreatingFlow] = useState(false)
  const [activeTab, setActiveTab]       = useState('brand-info')

  useEffect(() => { loadFlows() }, [])

  const loadFlows = async () => {
    setLoading(true)
    try {
      const res  = await fetch('/api/flows')
      const data = await res.json()
      setFlows(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.length > 0) setSelectedFlow(data[0])
    } catch {
      toast.error('Failed to load flows')
    } finally {
      setLoading(false)
    }
  }

  const createFlow = async (name) => {
    setCreatingFlow(true)
    try {
      const res  = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || `Flow ${flows.length + 1}` }),
      })
      const flow = await res.json()
      setFlows(prev => [...prev, flow])
      setSelectedFlow(flow)
      toast.success('Flow created')
      return flow
    } catch {
      toast.error('Failed to create flow')
      return null
    } finally {
      setCreatingFlow(false)
    }
  }

  // UUID is the stable lookup key; _id is MongoDB's internal ObjectId
  const getFlowId = (flow) => flow?.id

  // Called by BrandInfoPanel after a save — updates the flow in list + re-selects
  const handleFlowCreated = (flow) => {
    setFlows(prev => {
      const exists = prev.some(f => getFlowId(f) === getFlowId(flow))
      return exists
        ? prev.map(f => getFlowId(f) === getFlowId(flow) ? flow : f)
        : [...prev, flow]
    })
    setSelectedFlow(flow)
  }

  const selectedFlowId   = selectedFlow ? getFlowId(selectedFlow) : ''
  const displayName      = selectedFlow?.brandContext?.name || selectedFlow?.name || 'Untitled Flow'
  const logo             = selectedFlow?.brandContext?.logo

  // ── loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-slate-500 text-sm">Loading flows…</p>
        </div>
      </div>
    )
  }

  // ── first-run empty state ─────────────────────────────────────────────────────

  if (flows.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Workflow className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-2xl">Welcome to Flows</CardTitle>
            <CardDescription className="text-base">
              Create your first flow to start building brand content
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Button onClick={() => createFlow()} size="lg" disabled={creatingFlow}>
              {creatingFlow
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
                : <><Plus className="w-4 h-4 mr-2" />Create your first flow</>}
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ── main layout ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* ══ Top bar ══════════════════════════════════════════════════════════════ */}
      <header className="flex-shrink-0 h-12 border-b bg-white dark:bg-slate-950 flex items-center gap-3 px-4">

        {/* wordmark */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-200 dark:border-slate-800">
          <Workflow className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 hidden sm:block">
            Flows
          </span>
        </div>

        {/* flow selector */}
        <Select
          value={selectedFlowId}
          onValueChange={(id) => {
            const flow = flows.find(f => getFlowId(f) === id)
            if (flow) setSelectedFlow(flow)
          }}
        >
          <SelectTrigger className="w-48 h-8 text-sm border-none shadow-none bg-transparent focus:ring-0 px-2">
            <SelectValue placeholder="Select a flow…">
              <div className="flex items-center gap-2 min-w-0">
                {logo
                  ? <img src={logo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                  : <div className="w-4 h-4 rounded bg-primary/20 flex-shrink-0" />}
                <span className="truncate text-sm font-medium">{displayName}</span>
              </div>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {flows.map((flow) => {
              const fId   = getFlowId(flow)
              const fLogo = flow.brandContext?.logo
              const fName = flow.brandContext?.name || flow.name || 'Untitled Flow'
              return (
                <SelectItem key={fId} value={fId}>
                  <div className="flex items-center gap-2">
                    {fLogo
                      ? <img src={fLogo} alt="" className="w-4 h-4 rounded object-contain flex-shrink-0" />
                      : <div className="w-4 h-4 rounded bg-slate-200 dark:bg-slate-700 flex-shrink-0" />}
                    <span className="text-sm">{fName}</span>
                  </div>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        {/* new flow */}
        <Button
          onClick={() => createFlow()}
          disabled={creatingFlow}
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          title="New flow"
        >
          {creatingFlow
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />}
        </Button>

        {/* tab nav — sits immediately after the flow selector */}
        <nav className="flex items-center h-full ml-2 border-l border-slate-200 dark:border-slate-800 pl-2">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = activeTab === id
            return (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`
                  flex items-center gap-1.5 px-4 h-12 text-sm font-medium
                  border-b-2 transition-colors whitespace-nowrap
                  ${active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300'}
                `}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </nav>

        {/* spacer */}
        <div className="flex-1" />
      </header>

      {/* ══ Body ═════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 overflow-auto min-w-0">
        {activeTab === 'brand-info' && (
          <div className="p-6 max-w-4xl mx-auto">
            <BrandInfo
              flowId={selectedFlowId}
              flows={flows}
              onFlowCreated={handleFlowCreated}
              onFlowSelect={setSelectedFlow}
            />
          </div>
        )}

        {activeTab === 'creation' && (
          <div className="p-6 max-w-5xl mx-auto">
            <Creation
              flowId={selectedFlowId}
              brandContext={selectedFlow?.brandContext || null}
            />
          </div>
        )}

        {activeTab === 'gallery' && (
          <div className="p-6 max-w-5xl mx-auto">
            <Gallery
              flowId={selectedFlowId}
              brandContext={selectedFlow?.brandContext || null}
            />
          </div>
        )}
      </main>
    </div>
  )
}
