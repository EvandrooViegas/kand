/**
 * Flow CRUD handlers for API routes
 */

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { corsify } from '@/lib/services/middleware'

export async function handleGetFlows(db: any) {
  const list = await db
    .collection('flows')
    .find({})
    .sort({ updatedAt: -1 })
    .limit(200)
    .toArray()
  return corsify(NextResponse.json(list.map(({ _id, ...r }: any) => r)))
}

export async function handleCreateFlow(db: any, body: any) {
  const flow = {
    id: uuidv4(),
    name: body.name || 'Untitled Flow',
    canvasConfigs: body.canvasConfigs || [],
    posts: [],
    status: 'draft',
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await db.collection('flows').insertOne(flow)
  const { _id, ...rest } = flow
  return corsify(NextResponse.json(rest))
}

export async function handleGetFlow(db: any, id: string) {
  const f = await db.collection('flows').findOne({ id })
  if (!f) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  const { _id, ...rest } = f
  return corsify(NextResponse.json(rest))
}

export async function handleUpdateFlow(db: any, id: string, body: any) {
  const update = { ...body, id, updatedAt: new Date() }
  delete (update as any)._id
  delete (update as any).createdAt
  await db.collection('flows').updateOne({ id }, { $set: update })
  const f = await db.collection('flows').findOne({ id })
  const { _id, ...rest } = f || {}
  return corsify(NextResponse.json(rest))
}

export async function handleDeleteFlow(db: any, id: string) {
  await db.collection('flows').deleteOne({ id })
  return corsify(NextResponse.json({ success: true }))
}
