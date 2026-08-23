'use client'

import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import BrandInfo from '@/components/BrandInfo'

export default function FlowPage() {
  const [flows, setFlows] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedFlow, setSelectedFlow] = useState(null)

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
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'New Flow' }),
      })
      const flow = await res.json()
      setFlows([...flows, flow])
      setSelectedFlow(flow)
      toast.success('Flow created')
    } catch (e) {
      toast.error('Failed to create flow')
    }
  }

  if (loading) {
    return <div className="p-8">Loading...</div>
  }

  return (
    <div className="p-8">
      <div className="mb-6 flex justify-between items-center">
        <h1 className="text-3xl font-bold">Flow</h1>
        <Button onClick={createFlow}>New Flow</Button>
      </div>

      {selectedFlow ? (
        <Tabs defaultValue="brand-info" className="w-full">
          <TabsList>
            <TabsTrigger value="brand-info">Brand Info</TabsTrigger>
          </TabsList>

          <TabsContent value="brand-info" className="mt-6">
            <BrandInfo flowId={selectedFlow._id || selectedFlow.id} />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="text-center py-12">
          <p className="text-slate-600 dark:text-slate-400 mb-4">No flows yet</p>
          <Button onClick={createFlow}>Create Your First Flow</Button>
        </div>
      )}
    </div>
  )
}
