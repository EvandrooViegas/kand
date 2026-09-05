import { notFound } from 'next/navigation'
import { getFlows, getFlow } from '@/lib/data/flows'
import FlowShell from '@/components/FlowShell'

/**
 * RSC layout shared by all /flow/[brandId]/* pages.
 * Fetches flow list + selected flow on the server, passes them to the
 * client FlowShell which owns the top-bar + tab navigation.
 */
export default async function FlowBrandLayout({ children, params }) {
  const { brandId } = await params

  const [flows, flow] = await Promise.all([
    getFlows(),
    getFlow(brandId),
  ])

  if (!flow) notFound()

  return (
    <FlowShell flows={flows} currentFlow={flow}>
      {children}
    </FlowShell>
  )
}
