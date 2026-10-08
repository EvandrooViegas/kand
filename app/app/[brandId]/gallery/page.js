import { notFound } from 'next/navigation'
import { getFlow } from '@/lib/data/flows'
import Gallery from '@/components/Gallery'

export default async function GalleryPage({ params }) {
  const { brandId } = await params
  const flow = await getFlow(brandId)
  if (!flow) notFound()

  return (
    <div className="w-full px-5 py-8 sm:px-8 lg:px-10">
      <Gallery flowId={flow.id} brandContext={flow.brandContext ?? null} />
    </div>
  )
}
