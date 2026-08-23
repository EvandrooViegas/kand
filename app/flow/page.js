'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Plus, Workflow, Loader2, Sparkles, Trash2, Check } from 'lucide-react'
import BrandInfo from '@/components/BrandInfo'

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

  const createFlow = async () => {
    setCreatingFlow(true)
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Flow ${flows.length + 1}` }),
      })
      const flow = await res.json()
      setFlows([...flows, flow])
      setSelectedFlow(flow)
      toast.success('Flow created successfully')
    } catch (e) {
      toast.error('Failed to create flow')
    } finally {
      setCreatingFlow(false)
    }
  }

  const deleteFlow = async (flowId, e) => {
    e.stopPropagation()
    if (!confirm('Are you sure you want to delete this flow?')) return

    try {
      await fetch(`/api/flows/${flowId}`, { method: 'DELETE' })
      const updatedFlows = flows.filter(f => (f._id || f.id) !== flowId)
      setFlows(updatedFlows)
      if (selectedFlow && (selectedFlow._id || selectedFlow.id) === flowId) {
        setSelectedFlow(updatedFlows[0] || null)
      }
      toast.success('Flow deleted')
    } catch (e) {
      toast.error('Failed to delete flow')
    }
  }

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
    <div className="flex h-screen">
      {/* Sidebar - Flow Selection */}
      <div className="w-80 border-r bg-slate-50/50 dark:bg-slate-900/50 flex flex-col">
        <div className="p-6 border-b">
          <div className="flex items-center gap-2 mb-4">
            <Workflow className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold">Flows</h1>
          </div>
          <Button 
            onClick={createFlow} 
            disabled={creatingFlow}
            className="w-full"
            size="lg"
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

        <ScrollArea className="flex-1 p-4">
          {flows.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Sparkles className="w-12 h-12 mx-auto text-slate-400 mb-3" />
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No flows yet. Create one to get started!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {flows.map((flow) => {
                const flowId = flow._id || flow.id
                const isSelected = selectedFlow && (selectedFlow._id || selectedFlow.id) === flowId
                
                return (
                  <Card
                    key={flowId}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      isSelected 
                        ? 'border-primary bg-primary/5 shadow-sm' 
                        : 'hover:border-primary/50'
                    }`}
                    onClick={() => setSelectedFlow(flow)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            {isSelected && (
                              <Check className="w-4 h-4 text-primary flex-shrink-0" />
                            )}
                            <h3 className="font-semibold truncate">
                              {flow.name || 'Untitled Flow'}
                            </h3>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {flow.createdAt 
                              ? new Date(flow.createdAt).toLocaleDateString()
                              : 'Recently created'
                            }
                          </p>
                          {flow.status && (
                            <Badge variant="secondary" className="mt-2 text-xs">
                              {flow.status}
                            </Badge>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                          onClick={(e) => deleteFlow(flowId, e)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </ScrollArea>
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
              <TabsList className="grid w-full max-w-md grid-cols-1 mb-8">
                <TabsTrigger value="brand-info" className="text-base">
                  <Sparkles className="w-4 h-4 mr-2" />
                  Brand Information
                </TabsTrigger>
              </TabsList>

              <TabsContent value="brand-info" className="mt-0">
                <BrandInfo flowId={selectedFlow._id || selectedFlow.id} />
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
                <Button onClick={createFlow} size="lg" disabled={creatingFlow}>
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
