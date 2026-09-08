import { NextResponse } from 'next/server'
import { generateLogoVariants } from '@/lib/services/logoVariants'
export const runtime = 'nodejs'
export async function POST(request) {
  try {
    const { logo } = await request.json()
    if (typeof logo !== 'string' || !logo) return NextResponse.json({ error: 'Logo URL is required' }, { status: 400 })
    return NextResponse.json(await generateLogoVariants(logo))
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to generate logo variants' }, { status: 422 })
  }
}
