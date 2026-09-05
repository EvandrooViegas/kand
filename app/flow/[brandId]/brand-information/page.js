import { getFlow, getFlows } from '@/lib/data/flows'
import { notFound } from 'next/navigation'
import BrandInfo from '@/components/BrandInfo'

export default async function BrandInformationPage({ params }) {
  const { brandId } = await params
  const [flow, flows] = await Promise.all([getFlow(brandId), getFlows()])
  if (!flow) notFound()

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <BrandInfo
        flowId={flow.id}
        flows={flows}
      />
    </div>
  )
}
