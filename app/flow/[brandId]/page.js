import { redirect } from 'next/navigation'

/**
 * /flow/[brandId] → redirect to the default tab (creation).
 */
export default async function FlowBrandRoot({ params }) {
  const { brandId } = await params
  redirect(`/flow/${brandId}/creation`)
}
