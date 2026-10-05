'use client'

import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { useState, useTransition } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Loader2, Plus, Trash2, Workflow, Wand2, Images, Sparkles } from 'lucide-react'
import { toast } from 'sonner'

const TABS = [
  { slug: 'creation',           label: 'Creation',           icon: Wand2     },
  { slug: 'brand-information',  label: 'Brand Personalization',  icon: Sparkles  },
  { slug: 'gallery',            label: 'Gallery',            icon: Images    },
]

/**
 * Client component — owns the top bar (flow selector + tab nav).
 * Receives server-fetched flows + currentFlow as props so the initial
 * render is already populated without a client-side fetch.
 */
export default function FlowShell({ flows: initialFlows, currentFlow, children }) {
  const router   = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  const [flows, setFlows]       = useState(initialFlows)
  const [creating, setCreating] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Derive the active tab slug from the URL so it's always in sync.
  // pathname looks like /flow/<brandId>/<slug>
  const activeSlug = pathname.split('/')[3] ?? 'creation'

  const currentBrandId  = currentFlow.id
  const displayName     = currentFlow.brandContext?.name || currentFlow.name || 'Untitled Flow'
  const logo            = currentFlow.brandContext?.logo

  // Switching flows → navigate to the same tab under the new brand
  const handleFlowChange = (id) => {
    startTransition(() => {
      router.push(`/flow/${id}/${activeSlug}`)
    })
  }

  const createFlow = async () => {
    setCreating(true)
    try {
      const res = await fetch('/api/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Flow ${flows.length + 1}` }),
      })
      if (!res.ok) throw new Error('Failed to create flow')
      const flow = await res.json()
      setFlows(prev => [...prev, flow])
      router.push(`/flow/${flow.id}/creation`)
      toast.success('Flow created')
    } catch {
      toast.error('Failed to create flow')
    } finally {
      setCreating(false)
    }
  }

  // Removes the brand record only; posts already created keep their embedded brand and stay in Studio.
  const deleteFlow = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/flows/${currentBrandId}`, { method: 'DELETE' })
      if (!res.ok && res.status !== 404) throw new Error((await res.json().catch(() => ({}))).error || 'Failed to delete brand')
      const remaining = flows.filter(f => f.id !== currentBrandId)
      setFlows(remaining)
      setConfirmDelete(false)
      toast.success(`${displayName} deleted`)
      router.replace(remaining.length ? `/flow/${remaining[0].id}/${activeSlug}` : '/flow')
      router.refresh()
    } catch (error) {
      toast.error(error.message || 'Failed to delete brand')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header className="flex-shrink-0 border-b bg-white dark:bg-slate-950 flex flex-wrap items-center gap-x-3 px-4 pt-2 md:h-12 md:flex-nowrap md:pt-0">

        {/* wordmark */}
        <div className="flex items-center gap-2 pr-3 border-r border-slate-200 dark:border-slate-800">
          <Workflow className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-200 hidden sm:block">
            Flows
          </span>
        </div>

        {/* flow selector */}
        <Select value={currentBrandId} onValueChange={handleFlowChange} disabled={isPending}>
          <SelectTrigger className="w-40 min-w-0 flex-1 sm:w-48 sm:flex-none h-8 text-sm border-none shadow-none bg-transparent focus:ring-0 px-2">
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
              const fLogo = flow.brandContext?.logo
              const fName = flow.brandContext?.name || flow.name || 'Untitled Flow'
              return (
                <SelectItem key={flow.id} value={flow.id}>
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

        {/* new flow button */}
        <Button
          onClick={createFlow}
          disabled={creating}
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
          title="New flow"
        >
          {creating
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Plus className="w-4 h-4" />}
        </Button>

        {/* delete current brand */}
        <Button
          onClick={() => setConfirmDelete(true)}
          disabled={deleting}
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-slate-500 hover:text-red-600 dark:hover:text-red-400"
          title="Delete brand"
          aria-label="Delete brand"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
        <AlertDialog open={confirmDelete} onOpenChange={open => !deleting && setConfirmDelete(open)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete “{displayName}”?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes the brand profile, its research, content ideas and design settings. Posts already created stay in Studio. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={e => { e.preventDefault(); deleteFlow() }}
                disabled={deleting}
                className="bg-red-600 text-white hover:bg-red-700"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                Delete brand
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* tab nav */}
        <nav className="order-last flex w-full items-center overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:order-none md:w-auto md:h-full md:ml-2 md:border-l border-slate-200 dark:border-slate-800 md:pl-2">
          {TABS.map(({ slug, label, icon: Icon }) => {
            const active = activeSlug === slug
            return (
              <Link
                key={slug}
                href={`/flow/${currentBrandId}/${slug}`}
                className={`
                  flex shrink-0 items-center gap-1.5 px-3 md:px-4 h-12 md:h-full text-sm font-medium
                  border-b-2 transition-colors whitespace-nowrap
                  ${active
                    ? 'border-primary text-primary'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:border-slate-300'}
                `}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            )
          })}
        </nav>

        <div className="hidden md:block flex-1" />
        <Link href="/design-library" className="hidden shrink-0 text-xs text-slate-500 hover:text-foreground sm:block">Design Library</Link>
      </header>

      {/* ── Page content ─────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto min-w-0">
        {children}
      </main>
    </div>
  )
}
