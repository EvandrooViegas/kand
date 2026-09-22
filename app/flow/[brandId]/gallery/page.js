import { getFlow } from '@/lib/data/flows'
import { notFound } from 'next/navigation'
import Gallery from '@/components/Gallery'

export default async function GalleryPage({ params }) {
  const { brandId } = await params
  const flow = await getFlow(brandId)
  if (!flow) notFound()

  return (
    <div className="p-6 w-full">
      <Gallery
        flowId={flow.id}
        brandContext={flow.brandContext ?? null}
      />
    </div>
  )
}
