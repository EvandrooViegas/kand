import { getFlow } from '@/lib/data/flows'
import { notFound } from 'next/navigation'
import Creation from '@/components/Creation'

export default async function CreationPage({ params }) {
  const { brandId } = await params
  const flow = await getFlow(brandId)
  if (!flow) notFound()

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Creation
        flowId={flow.id}
        brandContext={flow.brandContext ?? null}
      />
    </div>
  )
}
