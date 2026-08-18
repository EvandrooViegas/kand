/**
 * Gallery CRUD handlers for API routes
 */

import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { corsify } from '@/lib/services/middleware'

export async function handleGetGalleries(db: any) {
  const list = await db.collection('galleries').find({}).sort({ updatedAt: -1 }).toArray()
  return corsify(NextResponse.json(list.map(({ _id, ...r }: any) => r)))
}

export async function handleCreateGallery(db: any, body: any) {
  const gallery = {
    id: uuidv4(),
    name: body.name || 'Untitled Gallery',
    images: body.images || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  await db.collection('galleries').insertOne(gallery)
  const { _id, ...rest } = gallery
  return corsify(NextResponse.json(rest))
}

export async function handleGetGallery(db: any, id: string) {
  const g = await db.collection('galleries').findOne({ id })
  if (!g) return corsify(NextResponse.json({ error: 'Not found' }, { status: 404 }))
  const { _id, ...rest } = g
  return corsify(NextResponse.json(rest))
}

export async function handleUpdateGallery(db: any, id: string, body: any) {
  const update = { ...body, id, updatedAt: new Date() }
  delete (update as any)._id
  delete (update as any).createdAt
  await db.collection('galleries').updateOne({ id }, { $set: update })
  const g = await db.collection('galleries').findOne({ id })
  const { _id, ...rest } = g || {}
  return corsify(NextResponse.json(rest))
}

export async function handleDeleteGallery(db: any, id: string) {
  await db.collection('galleries').deleteOne({ id })
  return corsify(NextResponse.json({ success: true }))
}
