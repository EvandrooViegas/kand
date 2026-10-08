import { getFlows } from '@/lib/data/flows'
import BrandOnboarding from '@/components/app/onboarding/BrandOnboarding'

// Reads the brand list on every request; never prerendered at build time.
export const dynamic = 'force-dynamic'

export const metadata = { title: 'Add a brand · Batkle' }

/**
 * /app/new: the brand onboarding. `?website=` (from the home page form) starts the research straight away.
 */
export default async function NewBrandPage({ searchParams }) {
  const params = await searchParams
  const website = typeof params?.website === 'string' ? params.website.slice(0, 500) : ''
  const flows = await getFlows()
  return <BrandOnboarding initialWebsite={website} firstBrand={flows.length === 0} />
}
