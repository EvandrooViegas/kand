import { redirect } from 'next/navigation'
import { getFlows } from '@/lib/data/flows'

// Reads the brand list on every request; never prerendered at build time.
export const dynamic = 'force-dynamic'

/**
 * /app: a website from the home page form (/app?website=...) goes straight into onboarding.
 * Otherwise open the first brand's Creation page, or the onboarding when there is no brand yet.
 */
export default async function AppHome({ searchParams }) {
  const params = await searchParams
  const website = typeof params?.website === 'string' ? params.website.trim() : ''
  if (website) redirect(`/app/new?website=${encodeURIComponent(website.slice(0, 500))}`)
  const flows = await getFlows()
  redirect(flows.length > 0 ? `/app/${flows[0].id}/creation` : '/app/new')
}
