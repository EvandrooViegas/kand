import { connectToMongo } from '@/lib/services/db/mongo'

export interface FlowBrandContext {
  name?: string
  about?: string
  logo?: string
  language?: string
  colors?: string[]
  fonts?: string[]
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
export async function getFlows(): Promise<Flow[]> {
  const db = await connectToMongo()
  const flows = await db.collection('flows').find({}).toArray()
  // Strip non-serialisable _id before passing to client
  return flows.map(({ _id, ...f }: any) => f) as Flow[]
}

/**
 * Fetch a single flow by its UUID — for use in React Server Components only.
 */
export async function getFlow(id: string): Promise<Flow | null> {
  const db = await connectToMongo()
  const flow = await db.collection('flows').findOne({ id })
  if (!flow) return null
  const { _id, ...f } = flow as any
  return f as Flow
}
