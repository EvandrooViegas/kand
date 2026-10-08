import { redirect } from 'next/navigation'

/** /app/[brandId] opens the brand's Creation page. */
export default async function AppBrandRoot({ params }) {
  const { brandId } = await params
  redirect(`/app/${brandId}/creation`)
}
