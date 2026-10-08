import { notFound } from 'next/navigation'
import { getFlow } from '@/lib/data/flows'
import CreationPage from '@/components/app/creation/CreationPage'

export default async function Creation({ params }) {
  const { brandId } = await params
  const flow = await getFlow(brandId)
  if (!flow) notFound()

  return <CreationPage flowId={flow.id} brandContext={flow.brandContext ?? null} />
}
