import { cache } from 'react'
import { connectToMongo } from '@/lib/services/db/mongo'
import { ensureMinimumBrandDesigns } from '@/lib/designs/minimumBrandDesigns'

export interface FlowBrandContext {
  name?: string
  about?: string
  logo?: string
  language?: string
  colors?: string[]
  fonts?: string[]
  imageDisposition?: 'cutout' | 'background' | 'framed' | 'none'
  services?: string[]
  projects?: { name: string; description: string; sourceUrl: string }[]
  targetAudience?: string
  tone?: string
  suggestedCtas?: string[]
  differentiators?: string[]
  contentTopics?: string[]
  website?: string
  profileLanguage?: 'en'
  researchSources?: { url: string; title: string; category: string }[]
}

export interface Flow {
  id: string
  name: string
  brandContext?: FlowBrandContext
  createdAt?: Date
  updatedAt?: Date
  [key: string]: unknown
}

/**
 * Fetch all flows directly from MongoDB — for use in React Server Components only.
 */
export const getFlows = cache(async (): Promise<Flow[]> => {
  const db = await connectToMongo()
  const flows = await db.collection('flows').find({}, { projection: { _id: 0, id: 1, name: 1, 'brandContext.name': 1, 'brandContext.logo': 1 } }).toArray()
  // Strip non-serialisable _id before passing to client
  return flows.map(({ _id, ...f }: any) => f) as Flow[]
})

/**
 * Fetch a single flow by its UUID — for use in React Server Components only.
 */
export const getFlow = cache(async (id: string): Promise<Flow | null> => {
  const db = await connectToMongo()
  const flow = await db.collection('flows').findOne({ id })
  if (!flow) return null
  const { _id, ...f } = await ensureMinimumBrandDesigns(db,flow) as any
  return f as Flow
})
