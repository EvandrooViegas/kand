'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Plus, Workflow } from 'lucide-react'
import { toast } from 'sonner'

/**
 * Shown at /flow when there are no flows yet.
 * Creates a flow via the API then navigates to its creation page.
 */
export default function FlowEmptyState() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)

  const createFlow = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My First Flow' }),
      })
      if (!res.ok) throw new Error('Failed to create flow')
      const flow = await res.json()
      router.push(`/flow/${flow.id}/creation`)
    } catch {
      toast.error('Failed to create flow')
      setCreating(false)
    }
  }

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
          <Button onClick={createFlow} size="lg" disabled={creating}>
            {creating
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Creating…</>
              : <><Plus className="w-4 h-4 mr-2" />Create your first flow</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
