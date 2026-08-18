'use client'

import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { PROGRESS_STEPS } from '../constants'

export function GenerationProgress({ flowId }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [totalSteps, setTotalSteps] = useState(8)
  const [connectionError, setConnectionError] = useState(false)

  useEffect(() => {
    if (!flowId) return

    try {
      const eventSource = new EventSource(`/api/flows/${flowId}/progress`)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.step !== undefined) {
            setCurrentStep(data.step)
          }
          if (data.total !== undefined) {
            setTotalSteps(data.total)
          }
          setConnectionError(false)
        } catch (e) {
          console.error('Failed to parse progress event:', e)
        }
      }

      eventSource.onerror = () => {
        setConnectionError(true)
        eventSource.close()
      }

      return () => eventSource.close()
    } catch (e) {
      console.error('Failed to connect to progress stream:', e)
      setConnectionError(true)
    }
  }, [flowId])

  return (
    <div className="rounded-2xl border-2 border-foreground/10 bg-[#D4FF00]/5 p-5 flex items-center gap-4 animate-in fade-in duration-300">
      <div className="relative w-10 h-10 shrink-0">
        <RefreshCw className="w-10 h-10 animate-spin text-foreground/80" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-0.5">
          Working
        </p>
        <p
          key={currentStep}
          className="text-sm font-semibold animate-in fade-in slide-in-from-left-1 duration-200 truncate"
        >
          {PROGRESS_STEPS[currentStep] || 'Processing'}…
        </p>
        <div className="mt-2 flex gap-1">
          {PROGRESS_STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-0.5 flex-1 rounded-full transition-colors ${
                i < currentStep
                  ? 'bg-foreground'
                  : i === currentStep
                  ? 'bg-[#D4FF00]'
                  : 'bg-foreground/15'
              }`}
            />
          ))}
        </div>
        {connectionError && (
          <p className="text-[9px] text-amber-600 mt-2">
            Updates paused (showing client-side progress)
          </p>
        )}
      </div>
    </div>
  )
}
