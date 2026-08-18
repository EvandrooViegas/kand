import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { corsify } from '@/lib/services/middleware'

export async function handleGetFlows(db: any) {
  const flows = await db
    .collection('flows')
    .find({})
    .sort({ updatedAt: -1 })
    .limit(100)
    .toArray()
  return corsify(
    NextResponse.json(
      flows.map(({ _id, ...rest }: any) => rest)
    )
  )
}

export async function handleCreateFlow(db: any, body: any) {
  const newFlow = {
    id: uuidv4(),
    name: body.name || 'New Campaign',
    businessContext: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  await db.collection('flows').insertOne(newFlow)
  const { _id, ...rest } = newFlow
  return corsify(NextResponse.json(rest))
}

export async function handleGetFlow(db: any, id: string) {
  const flow = await db.collection('flows').findOne({ id })
  if (!flow) {
    return corsify(
      NextResponse.json({ error: 'Flow not found' }, { status: 404 })
    )
  }
  const { _id, ...rest } = flow
  return corsify(NextResponse.json(rest))
}

export async function handleUpdateFlow(db: any, id: string, body: any) {
  const update = { ...body, id, updatedAt: new Date() }
  delete (update as any)._id
  delete (update as any).createdAt

  await db.collection('flows').updateOne({ id }, { $set: update })
  const flow = await db.collection('flows').findOne({ id })
  const { _id, ...rest } = flow || {}
  return corsify(NextResponse.json(rest))
}

export async function handleDeleteFlow(db: any, id: string) {
  await db.collection('flows').deleteOne({ id })
  return corsify(NextResponse.json({ success: true }))
}
