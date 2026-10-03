import { randomUUID } from 'node:crypto'
import { referenceSchema } from './types'
import { analyzeDesignStudy } from './studyAnalysis'
import { isTransientProviderError } from '@/lib/services/ai/requestBudget'

const runners = (globalThis as any).__designAnalysisRunners ||= new Map<string, Promise<void>>()
const jobs = (db: any) => db.collection('globalDesignAnalysisJobs')
export async function createAnalysisJob(db: any, input: any) {
  const referenceImages = referenceSchema.array().min(1).max(30).parse(input.referenceImages)
  const id = randomUUID(), now = new Date()
  await jobs(db).insertOne({ _id: id, id, status: 'queued', referenceImages, workflow: 'study', attempts: 0, completed: 0, total: referenceImages.length * 2 - 1, stage: 'Queued', createdAt: now, updatedAt: now, nextRunAt: now })
  kickAnalysisJob(db, id)
  return readAnalysisJob(db, id)
}
export async function readAnalysisJob(db: any, id: string) {
  let job = await jobs(db).findOne({ _id: id })
  if (!job) throw Object.assign(Error('Analysis job not found.'), { status: 404 })
  // Repair old token-limit failures once, preserving their completed-stage cache.
  if (job.workflow === 'study' && job.status === 'failed' && !job.tokenLimitRecovery && /413|request too large|rate_limit_exceeded/i.test(job.error || '')) {
    await jobs(db).updateOne({ _id: id, status: 'failed' }, { $set: { status: 'queued', attempts: 0, error: null, nextRunAt: new Date(), tokenLimitRecovery: true } })
    job = await jobs(db).findOne({ _id: id })
  }
  const publicError = job.error ? job.workflow !== 'study' ? 'This job used the previous drafting workflow. Start a new Design Study from your references.' : job.status === 'retrying' ? 'The service is busy. Resuming automatically…' : 'We could not finish this study. Your progress is saved; resume to continue.' : null
  return { id: job.id, status: job.status, completed: job.completed, total: job.total, stage: job.stage, provider: job.provider, error: publicError, workflow: job.workflow, result: job.workflow === 'study' && job.status === 'completed' ? job.result : undefined, updatedAt: job.updatedAt }
}
export async function retryAnalysisJob(db: any, id: string) {
  await jobs(db).updateOne({ _id: id, status: 'failed' }, { $set: { status: 'queued', attempts: 0, error: null, nextRunAt: new Date() } })
  kickAnalysisJob(db, id)
  return readAnalysisJob(db, id)
}
/** Lease and checkpoints survive process restarts; polling wakes abandoned jobs. */
export function kickAnalysisJob(db: any, id: string) {
  if (runners.has(id)) return
  const task = runAnalysisJob(db, id).catch(() => {}).finally(() => runners.delete(id))
  runners.set(id, task)
}
export async function runAnalysisJob(db: any, id: string) {
  const now = new Date(), token = randomUUID()
  const job = await jobs(db).findOneAndUpdate({ _id: id, $or: [
    { status: { $in: ['queued', 'retrying'] }, nextRunAt: { $lte: now } },
    { status: 'running', leaseUntil: { $lt: now } },
  ] }, { $set: { status: 'running', workerToken: token, leaseUntil: new Date(Date.now() + 90000), updatedAt: now }, $inc: { attempts: 1 } }, { returnDocument: 'after', includeResultMetadata: false })
  if (!job) return
  // Old draft jobs must never resume template generation through this workflow.
  if (job.workflow !== 'study') {
    await jobs(db).updateOne({ _id: id, workerToken: token }, { $set: { status: 'failed', error: 'Start a new Design Study using the reference images.', updatedAt: new Date() }, $unset: { leaseUntil: '', workerToken: '' } })
    return
  }
  let total = job.total
  const owned = { _id: id, workerToken: token, status: 'running' }
  const heartbeat = setInterval(() => { void jobs(db).updateOne(owned, { $set: { leaseUntil: new Date(Date.now() + 90000) } }).catch(() => {}) }, 20000)
  try {
    const result = await analyzeDesignStudy(db, { referenceImages: job.referenceImages }, { onProgress: async (progress: any) => {
      total = progress.total
      const changed = await jobs(db).updateOne(owned, { $set: { ...progress, updatedAt: new Date(), leaseUntil: new Date(Date.now() + 90000) } })
      if (!changed.matchedCount) throw Error('Analysis job ownership changed.')
    } })
    if (!await jobs(db).findOne(owned)) return
    await jobs(db).updateOne(owned, { $set: { status: 'completed', completed: total, total, stage: 'Study ready for review', result, error: null, updatedAt: new Date() }, $unset: { leaseUntil: '', workerToken: '' } })
  } catch (error: any) {
    const retry = isTransientProviderError(error) && job.attempts < 3
    const delay = Math.min(30000, 2000 * 2 ** job.attempts)
    await jobs(db).updateOne(owned, { $set: { status: retry ? 'retrying' : 'failed', error: retry ? 'Provider unavailable. Resuming automatically…' : 'Visual analysis paused. Your progress is saved.', diagnostic: { status: error.status, code: error.code, message: String(error.message || '').slice(0, 2000) }, nextRunAt: new Date(Date.now() + delay), updatedAt: new Date() }, $unset: { leaseUntil: '', workerToken: '' } })
    if (retry) setTimeout(() => kickAnalysisJob(db, id), delay).unref?.()
  } finally { clearInterval(heartbeat) }
}
