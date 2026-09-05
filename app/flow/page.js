import { redirect } from 'next/navigation'
import { getFlows } from '@/lib/data/flows'
import FlowEmptyState from '@/components/FlowEmptyState'

/**
 * /flow — Server Component entry point.
 *
 * • If flows exist → redirect to the first flow's creation page.
 * • If no flows exist → render the empty-state "create your first flow" UI.
 */
export default async function FlowPage() {
  const flows = await getFlows()

  if (flows.length > 0) {
    redirect(`/flow/${flows[0].id}/creation`)
  }

  return <FlowEmptyState />
}
