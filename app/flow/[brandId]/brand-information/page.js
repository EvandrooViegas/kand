import { getFlow } from '@/lib/data/flows'
import { notFound } from 'next/navigation'
import BrandInfo from '@/components/BrandInfo'

export default async function BrandInformationPage({ params }) {
  const { brandId } = await params
  const flow = await getFlow(brandId)
  if (!flow) notFound()

  return (
    <div className="px-4 py-6 sm:p-6 w-full">
      <BrandInfo
        key={flow.id}
        flowId={flow.id}
        initialBrandContext={flow.brandContext || null}
      />
    </div>
  )
}
