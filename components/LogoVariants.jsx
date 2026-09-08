'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'

const labels = { originalTransparent: 'Original · transparent', blackTransparent: 'Black · transparent', whiteTransparent: 'White · transparent', blackOnWhite: 'Black on white', whiteOnBlack: 'White on black', originalOnWhite: 'Original on white', originalOnBlack: 'Original on black' }

export default function LogoVariants({ logo, variants, onChange }) {
  const [busy, setBusy] = useState(false)
  const valid = variants?.source === logo
  async function generate() {
    setBusy(true)
    try {
      const response = await fetch('/api/logo-variants', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logo }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onChange(result)
      toast.success('Logo variants generated. Save brand to keep them.')
    } catch (error) { toast.error(error.message || 'Unable to generate variants') }
    finally { setBusy(false) }
  }
  return <div className="space-y-3 py-3">
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm font-medium">Logo variants</span>
      <Button type="button" variant="outline" size="sm" disabled={!logo || busy} onClick={generate}>
        {busy ? 'Generating…' : valid ? 'Regenerate variants' : 'Generate logo variants'}
      </Button>
    </div>
    <p className="text-xs text-slate-500">Transparent and contrasting versions for light and dark designs.</p>
    {valid && <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {Object.entries(labels).map(([key, label]) => variants[key] && <a key={key} href={variants[key]} download={`logo-${key}.png`} className="rounded-lg border overflow-hidden" title={`Download ${label}`}>
        <div className={`h-20 p-3 ${key.startsWith('white') || key.endsWith('Black') ? 'bg-slate-800' : 'bg-slate-100'}`}><img src={variants[key]} alt={label} className="w-full h-full object-contain" /></div>
        <p className="text-xs p-2">{label}</p>
      </a>)}
    </div>}
  </div>
}
