import { createHash } from 'node:crypto'
import { INITIAL_GLOBAL_FAMILIES } from './seeds'
import { familySchema } from './types'
import { ensureFamilyVariations } from './variations'
import { designStudySchema } from './study'
import type { GlobalDesignFamily, GlobalDesignRecord, BrandGlobalDesign } from './types'

export class DesignLibraryError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}
const records = (db: any) => db.collection('globalDesignFamilies')
const versions = (db: any) => db.collection('globalDesignVersions')
const plain = ({ _id, ...rest }: any) => rest
const initialized = new WeakMap<object, Promise<void>>()
// Existing MongoDB collections are schemaless. Fixed _ids make this additive migration idempotent.
export async function ensureGlobalDesignLibrary(db: any) {
  if (initialized.has(db)) return initialized.get(db)
  const pending = seedLibrary(db).catch(error => { initialized.delete(db); throw error })
  initialized.set(db, pending)
  return pending
}
async function seedLibrary(db: any) {
  for (const seed of INITIAL_GLOBAL_FAMILIES) {
    const family = familySchema.parse(seed)
    await versions(db).updateOne({ _id: `${family.id}:${family.version}` }, { $setOnInsert: { ...family } }, { upsert: true })
    await records(db).updateOne({ _id: family.id }, { $setOnInsert: { id: family.id, status: 'published', revision: family.version + 1, publishedVersion: family.version, draft: family, updatedAt: new Date() } }, { upsert: true })
    const current = await records(db).findOne({ _id: family.id })
    // Upgrade only untouched bundled families. Admin edits and pinned brand versions win.
    if (!current.deletedAt && current.status === 'published' && current.publishedVersion < family.version && current.revision === current.publishedVersion + 1) {
      await records(db).updateOne({ _id: family.id, revision: current.revision, status: 'published' }, { $set: { draft: family, publishedVersion: family.version, revision: family.version + 1, updatedAt: new Date() } })
    }
  }
}
export async function getGlobalVersion(db: any, id: string, version: number): Promise<GlobalDesignFamily> {
  const family = await versions(db).findOne({ _id: `${id}:${version}` })
  if (!family) throw new DesignLibraryError('The selected design version is unavailable.', 404)
  return familySchema.parse(ensureFamilyVariations(plain(family)))
}
export async function listGlobalDesigns(db: any, admin = false) {
  await ensureGlobalDesignLibrary(db)
  const list = await records(db).find({ deletedAt: { $exists: false }, ...(admin ? {} : { status: 'published' }) }).toArray()
  return admin
    ? list.map(record => ({ ...plain(record), draft: familySchema.parse(ensureFamilyVariations(record.draft)) }))
    : Promise.all(list.map((r: GlobalDesignRecord) => getGlobalVersion(db, r.id, r.publishedVersion!)))
}
export async function getGlobalRecord(db: any, id: string): Promise<GlobalDesignRecord> {
  await ensureGlobalDesignLibrary(db)
  const record = await records(db).findOne({ _id: id, deletedAt: { $exists: false } })
  if (!record) throw new DesignLibraryError('Design family not found', 404)
  const value = plain(record)
  return { ...value, draft: familySchema.parse(ensureFamilyVariations(value.draft)) }
}
export async function saveGlobalDraft(db: any, input: unknown, revision?: number) {
  const family = familySchema.parse(ensureFamilyVariations(familySchema.parse(input)))
  if (revision === undefined) {
    try { await records(db).insertOne({ _id: family.id, id: family.id, draft: family, revision: 1, status: 'draft', updatedAt: new Date() }) }
    catch (error: any) { if (error.code === 11000) throw new DesignLibraryError('This family already exists. Reload before saving.', 409); throw error }
  } else {
    const result = await records(db).updateOne({ _id: family.id, revision, deletedAt: { $exists: false } }, { $set: { draft: family, updatedAt: new Date() }, $inc: { revision: 1 } })
    if (!result.matchedCount) throw new DesignLibraryError('This family changed in another window. Reload before saving.', 409)
  }
  return getGlobalRecord(db, family.id)
}
export async function publishGlobalDesign(db: any, id: string, revision: number) {
  const record = await getGlobalRecord(db, id)
  if (record.revision !== revision) throw new DesignLibraryError('Reload this draft before publishing.', 409)
  const family = familySchema.parse({ ...record.draft, version: revision })
  // A draft revision is immutable. An interrupted publish can safely retry this insert.
  await versions(db).updateOne({ _id: `${id}:${revision}` }, { $setOnInsert: family }, { upsert: true })
  const result = await records(db).updateOne({ _id: id, revision, deletedAt: { $exists: false } }, { $set: { status: 'published', publishedVersion: revision, updatedAt: new Date() }, $inc: { revision: 1 } })
  if (!result.matchedCount) throw new DesignLibraryError('The draft changed while publishing. Reload and review it again.', 409)
  return getGlobalRecord(db, id)
}
export async function retireGlobalDesign(db: any, id: string, revision: number, deleted = false) {
  const result = await records(db).updateOne({ _id: id, revision, deletedAt: { $exists: false } }, { $set: { status: 'draft', ...(deleted ? { deletedAt: new Date() } : {}), updatedAt: new Date() }, $inc: { revision: 1 } })
  if (!result.matchedCount) throw new DesignLibraryError('The family changed. Reload before continuing.', 409)
  // Published versions remain available to brands and previously generated posts.
  return { success: true }
}
export async function selectBrandFamilies(db: any, flowId: string, ids: string[], studyIds?: string[]) {
  const selected = [...new Set(ids)]
  const flow = await db.collection('flows').findOne({ id: flowId })
  if (!flow) throw new DesignLibraryError('Brand not found', 404)
  const previousStudies = (flow.brandContext?.designs || []).filter((d: any) => d.source === 'study')
  const selectedStudies = [...new Set(studyIds ?? previousStudies.map((d: any) => d.studyId))] as string[]
  if (selected.length + selectedStudies.length < 1 || selected.length + selectedStudies.length > 24) throw new DesignLibraryError('Select between 1 and 24 designs or saved identities.')
  const studies = await Promise.all(selectedStudies.map(async studyId => {
    const existing = previousStudies.find((d: any) => d.studyId === studyId)
    if (existing) return existing
    const { study } = await getDesignStudy(db, studyId)
    const version = createHash('sha256').update(JSON.stringify(study)).digest('hex')
    const snapshotId = `${flowId}:${studyId}:${version}`
    await db.collection('brandDesignStudies').updateOne({ _id: snapshotId }, { $setOnInsert: { flowId, studyId, study, createdAt: new Date() } }, { upsert: true })
    return { id: `study-${studyId}`, source: 'study', studyId, studySnapshotId: snapshotId, studyVersion: version, name: study.name, referenceUrl: study.referenceImages[0].url, createdAt: new Date().toISOString() }
  }))
  const previous = (flow.brandContext?.designs || []).filter((d: any) => d.source === 'global')
  const designs: BrandGlobalDesign[] = await Promise.all(selected.map(async id => {
    const record = await getGlobalRecord(db, id).catch(error => {
      if (previous.some((d: any) => d.globalFamilyId === id)) return null
      throw error
    })
    const existing = previous.find((d: any) => d.globalFamilyId === id)
    if (existing) return existing // Keep its pinned version, including retired families.
    if (!record || record.status !== 'published') throw new DesignLibraryError('Only published designs can be imported.')
    const family = await getGlobalVersion(db, id, record.publishedVersion!)
    return { id: `global-${id}`, source: 'global' as const, globalFamilyId: id, globalVersion: family.version, name: family.name, tags: family.tags, createdAt: new Date().toISOString() }
  }))
  const legacy = (flow.brandContext?.designs || []).filter((d: any) => d.source !== 'global' && d.source !== 'study')
  const result = await db.collection('flows').updateOne({ id: flowId, 'brandContext.designs': flow.brandContext?.designs === undefined ? { $exists: false } : flow.brandContext.designs }, { $set: { 'brandContext.designs': [...legacy, ...designs, ...studies], 'brandContext.designLibraryVersion': 1, updatedAt: new Date() } })
  if (!result.matchedCount) throw new DesignLibraryError('Brand designs changed in another window. Reload and try again.', 409)
  return { brandContext: { ...flow.brandContext, designs: [...legacy, ...designs, ...studies], designLibraryVersion: 1 } }
}
export async function hydrateBrandFamilies(db: any, brand: any) {
  const designs = (brand?.designs || []).filter((d: any) => d.source === 'global')
  return Promise.all(designs.map(async (d: BrandGlobalDesign) => ({ design: d, family: await getGlobalVersion(db, d.globalFamilyId, d.globalVersion) })))
}

export async function listDesignStudies(db: any) {
  return (await db.collection('globalDesignStudies').find({}, { projection: { study: 1, id: 1, savedAt: 1 } }).toArray()).map(plain)
}
export async function getDesignStudy(db: any, id: string) {
  const record = await db.collection('globalDesignStudies').findOne({ _id: id })
  if (!record) throw new DesignLibraryError('Design study not found.', 404)
  return { ...plain(record), study: designStudySchema.parse(record.study) }
}
export async function saveDesignStudy(db: any, jobId: string) {
  const job = await db.collection('globalDesignAnalysisJobs').findOne({ _id: jobId })
  if (job?.workflow !== 'study' || job.status !== 'completed' || !job.result) throw new DesignLibraryError('Complete the visual analysis before saving its study.', 409)
  const study = designStudySchema.parse(job.result)
  // Saving the same reviewed result twice is harmless. No family or Canvas is created.
  await db.collection('globalDesignStudies').updateOne({ _id: jobId }, { $setOnInsert: { id: jobId, study, savedAt: new Date() } }, { upsert: true })
  return getDesignStudy(db, jobId)
}
