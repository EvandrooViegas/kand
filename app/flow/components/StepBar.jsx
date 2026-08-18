'use client'

import { Button } from '@/components/ui/button'
import { Check, ChevronRight } from 'lucide-react'

export function StepBar({ step, maxStep, onGoTo }) {
  const steps = ['Brand', 'Configure', 'Generate', 'Schedule']

  return (
    <div className="flex items-center">
      {steps.map((label, i) => {
        const num = i + 1
        const active = step === num
        const done = step > num
        const reachable = num <= maxStep

        return (
          <div key={label} className="flex items-center">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onGoTo(num)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                active
                  ? 'bg-[#D4FF00] text-foreground'
                  : done
                  ? 'bg-foreground/10 text-foreground/60 hover:bg-foreground/20 cursor-pointer'
                  : 'text-foreground/25 cursor-default'
              }`}
            >
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  active
                    ? 'bg-foreground text-[#D4FF00]'
                    : done
                    ? 'bg-foreground/20'
                    : 'border-2 border-foreground/15'
                }`}
              >
                {done ? <Check className="w-2.5 h-2.5" /> : num}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < steps.length - 1 && (
              <ChevronRight className="w-3 h-3 text-foreground/15 mx-0.5" />
            )}
          </div>
        )
      })}
    </div>
  )
}
