'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import { Plus, Workflow, Loader2, Sparkles, Wand2, Images } from 'lucide-react'
import BrandInfo from '@/components/BrandInfo'
import Creation from '@/components/Creation'
import Gallery from '@/components/Gallery'

export default function FlowPage() {
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFlow, setSelectedFlow] = useState(null)
  const [creatingFlow, setCreatingFlow] = useState(false)

  useEffect(() => {
    loadFlows()
  }, [])

  const loadFlows = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/flows')
      const data = await res.json()
      setFlows(Array.isArray(data) ? data : [])
      if (Array.isArray(data) && data.length > 0) {
        setSelectedFlow(data[0])
      }
    } catch (e) {
      toast.error('Failed to load flows')
    } finally {
      setLoading(false)
    }
  }

  const createFlow = async (name) => {
    setCreatingFlow(true)
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || `Flow ${flows.length + 1}` }),
      })
      const flow = await res.json()
      setFlows(prev => [...prev, flow])
      setSelectedFlow(flow)
      toast.success('Flow created successfully')
      return flow
    } catch (e) {
      toast.error('Failed to create flow')
      return null
    } finally {
      setCreatingFlow(false)
    }
  }

  // Always use flow.id (UUID) for API calls — flow._id is the MongoDB ObjectId
  // and is not indexed as the lookup key in the handlers.
  const getFlowId = (flow) => flow?.id

  // Called by BrandInfo after it creates or updates a flow on save
  const handleFlowCreated = (flow) => {
    setFlows(prev => {
      const exists = prev.some(f => getFlowId(f) === getFlowId(flow))
      // If it already exists update it in place (e.g. name changed after save)
      return exists
        ? prev.map(f => getFlowId(f) === getFlowId(flow) ? flow : f)
        : [...prev, flow]
    })
    setSelectedFlow(flow)
  }

  // Called by BrandInfo when it wants to switch the active flow
  const handleFlowSelect = (flow) => {
    setSelectedFlow(flow)
  }

  const selectedFlowId = selectedFlow ? getFlowId(selectedFlow) : ''

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
          <p className="text-slate-600 dark:text-slate-400">Loading your flows...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      {/* Top Navbar - Flow Selection */}
      <div className="w-full border-b bg-white dark:bg-slate-950 flex-shrink-0">
        <div className="px-6 py-3 flex items-center gap-4">
          {/* Title */}
          <div className="flex items-center gap-2">
            <Workflow className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-bold">Flows</h1>
          </div>

          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />

          {/* Flow Selector Dropdown */}
          {flows.length > 0 && (
            <Select
              value={selectedFlowId}
              onValueChange={(id) => {
                const flow = flows.find(f => getFlowId(f) === id)
                if (flow) setSelectedFlow(flow)
              }}
            >
              <SelectTrigger className="w-64">
                <SelectValue placeholder="Select a flow…">
                  {selectedFlow ? (
                    <div className="flex items-center gap-2 min-w-0">
                      {selectedFlow.brandContext?.logo ? (
                        <img
                          src={selectedFlow.brandContext.logo}
                          alt=""
                          className="w-5 h-5 rounded object-contain flex-shrink-0"
                        />
                      ) : null}
                      <span className="truncate">
                        {selectedFlow.brandContext?.name || selectedFlow.name || 'Untitled Flow'}
                      </span>
                    </div>
                  ) : 'Select a flow…'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {flows.map((flow) => {
                  const flowId = getFlowId(flow)
                  const logo = flow.brandContext?.logo
                  const displayName = flow.brandContext?.name || flow.name || 'Untitled Flow'
                  return (
                    <SelectItem key={flowId} value={flowId}>
                      <div className="flex items-center gap-2">
                        {logo ? (
                          <img
                            src={logo}
                            alt=""
                            className="w-5 h-5 rounded object-contain flex-shrink-0"
                          />
                        ) : (
                          <div className="w-5 h-5 rounded bg-slate-200 dark:bg-slate-700 flex-shrink-0" />
                        )}
                        <span>{displayName}</span>
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          )}

          {/* New Flow Button */}
          <Button
            onClick={() => createFlow()}
            disabled={creatingFlow}
            size="sm"
          >
            {creatingFlow ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                New Flow
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto">
        {selectedFlow ? (
          <div className="p-8 max-w-6xl mx-auto">
            {/* Header */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-2">
                <Workflow className="w-8 h-8 text-primary" />
                <h2 className="text-3xl font-bold">
                  {selectedFlow.name || 'Untitled Flow'}
                </h2>
              </div>
              <p className="text-slate-600 dark:text-slate-400">
                Configure your brand information and design system
              </p>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="brand-info" className="w-full">
              <TabsList className="grid w-full max-w-xl grid-cols-3 mb-8">
                <TabsTrigger value="brand-info" className="text-base">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Brand Information
                </TabsTrigger>
                <TabsTrigger value="creation" className="text-base">
                  <Wand2 className="w-4 h-4 mr-2" />
                  Creation
                </TabsTrigger>
                <TabsTrigger value="gallery" className="text-base">
                  <Images className="w-4 h-4 mr-2" />
                  Gallery
                </TabsTrigger>
              </TabsList>

              <TabsContent value="brand-info" className="mt-0">
                <BrandInfo
                  flowId={selectedFlowId}
                  flows={flows}
                  onFlowCreated={handleFlowCreated}
                  onFlowSelect={handleFlowSelect}
                />
              </TabsContent>

              <TabsContent value="creation" className="mt-0">
                <Creation
                  flowId={selectedFlowId}
                  brandContext={selectedFlow?.brandContext || null}
                />
              </TabsContent>

              <TabsContent value="gallery" className="mt-0">
                <Gallery
                  flowId={selectedFlowId}
                  brandContext={selectedFlow?.brandContext || null}
                />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <Card className="max-w-md">
              <CardHeader className="text-center">
                <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Workflow className="w-8 h-8 text-primary" />
                </div>
                <CardTitle className="text-2xl">Welcome to Flows</CardTitle>
                <CardDescription className="text-base">
                  Create your first flow to start building your brand identity
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <Button onClick={() => createFlow()} size="lg" disabled={creatingFlow}>
                  {creatingFlow ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4 mr-2" />
                      Create Your First Flow
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
