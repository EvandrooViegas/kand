import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { createCarouselRun, readCarouselRun, retryCarouselRun, kickCarouselRun } from '@/lib/designs/global/carouselJobs'
import { brandCarouselContent, resolveBrandStudy } from '@/lib/designs/global/brandCarousel'
import { DesignLibraryError } from '@/lib/designs/global/store'

export async function handleBrandCarousel(db: any, request: Request) {
  try {
    const url = new URL(request.url)
    const body = request.method === 'POST' ? await request.json() : Object.fromEntries(url.searchParams)
    const { flowId, designId, ideaId, runId } = body
    if (typeof flowId !== 'string' || typeof designId !== 'string' || typeof ideaId !== 'string') throw new DesignLibraryError('Brand, idea and identity are required.')
    if (runId || request.method === 'GET') {
      const query = { 'brandPost.flowId': flowId, 'brandPost.ideaId': ideaId, 'brandPost.design.id': designId, ...(runId ? { _id: runId } : {}) }
      const job = await db.collection('globalCarouselRuns').find(query).sort({ createdAt: -1 }).limit(1).next()
      if (!job) return NextResponse.json(null)
      if (request.method === 'POST') return NextResponse.json(await retryCarouselRun(db, job.id))
      const result = await readCarouselRun(db, job.id); kickCarouselRun(db, job.id)
      return NextResponse.json(result)
    }
    const { design, study, brandName } = await resolveBrandStudy(db, flowId, designId)
    const carouselContent = brandCarouselContent(body.copy)
    const requestId = body.requestId || `carousel_${randomUUID()}`
    const existing = await db.collection('globalCarouselRuns').findOne({ _id: requestId })
    if (existing && (existing.brandPost?.flowId !== flowId || existing.brandPost?.ideaId !== ideaId || existing.brandPost?.design.id !== designId)) throw new DesignLibraryError('Generation request belongs to another post.', 409)
    const run = await createCarouselRun(db, { requestId, studyId: design.studyId, carouselContent, optionalInstructions: typeof body.optionalInstructions === 'string' ? body.optionalInstructions : '' }, { savedStudy: study, brandPost: { flowId, ideaId, design, copy: body.copy, name: `${brandName} — ${body.copy.slides[0].headline || 'Carousel'}`.slice(0, 120) } })
    return NextResponse.json(run, { status: 202 })
  } catch (error: any) {
    return NextResponse.json({ error: error.issues ? 'Provide carousel copy containing 2–20 non-empty slides.' : error.message }, { status: error.status || (error.issues ? 400 : 500) })
  }
}
