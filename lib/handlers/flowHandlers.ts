import { NextResponse } from 'next/server'
import { v4 as uuidv4 } from 'uuid'
import { corsify } from '@/lib/services/middleware'

export async function handleGetFlows(db: any) {
  try {
    const flows = await db.collection('flows').find({}).toArray()
    return corsify(NextResponse.json(flows))
  } catch (error: any) {
    return corsify(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function handleCreateFlow(db: any, body: any) {
  try {
    const flow = {
      id: uuidv4(),
      name: body.name || 'New Flow',
      brandContext: {},
      brandAnswers: {},
      brandQuestions: [],
      extractedContext: '',
      tone: 'informative',
      language: 'english',
      posts: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }
    await db.collection('flows').insertOne(flow)
    return corsify(NextResponse.json(flow))
  } catch (error: any) {
    return corsify(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function handleGetFlow(db: any, flowId: string) {
  try {
    const flow = await db.collection('flows').findOne({ id: flowId })
    if (!flow) {
      return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
    }
    return corsify(NextResponse.json(flow))
  } catch (error: any) {
    return corsify(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function handleUpdateFlow(db: any, flowId: string, body: any) {
  try {
    const updated = await db.collection('flows').findOneAndUpdate(
      { id: flowId },
      {
        $set: {
          ...body,
          updatedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    )
    if (!updated.value) {
      return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
    }
    return corsify(NextResponse.json(updated.value))
  } catch (error: any) {
    return corsify(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}

export async function handleDeleteFlow(db: any, flowId: string) {
  try {
    const result = await db.collection('flows').deleteOne({ id: flowId })
    if (result.deletedCount === 0) {
      return corsify(NextResponse.json({ error: 'Flow not found' }, { status: 404 }))
    }
    return corsify(NextResponse.json({ success: true }))
  } catch (error: any) {
    return corsify(NextResponse.json({ error: error.message }, { status: 500 }))
  }
}
