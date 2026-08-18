import { Suspense } from 'react'
import FlowPageClient from './page.client'

// Server-side component that fetches the flows
export const metadata = {
  title: 'Flow | Kand',
  description: 'Create automated Instagram post flows'
}

async function getFlows() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/flows`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch (e) {
    console.error('Failed to fetch flows:', e)
    return []
  }
}

async function getCanvases() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/canvases`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch (e) {
    console.error('Failed to fetch canvases:', e)
    return []
  }
}

async function getGalleries() {
  try {
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
    const res = await fetch(`${baseUrl}/api/galleries`, { cache: 'no-store' })
    if (!res.ok) return []
    return await res.json()
  } catch (e) {
    console.error('Failed to fetch galleries:', e)
    return []
  }
}

export default async function FlowPage() {
  // Server-side data fetching
  const flows = await getFlows()
  const canvases = await getCanvases()
  const galleries = await getGalleries()

  return (
    <Suspense fallback={<div>Loading...</div>}>
      <FlowPageClient initialFlows={flows} initialCanvases={canvases} initialGalleries={galleries} />
    </Suspense>
  )
}
