import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { MasterResume, ResumeVersion } from '@/resume/schema/resume'
import type { Application } from '@/applications/schema/application'
import type { Job } from '@/jobs/schema/job'

/**
 * 本地优先存储：简历、岗位缓存、申请记录全部在 IndexedDB。
 * 不上传任何服务器。
 */
interface BossPassDB extends DBSchema {
  masterResumes: {
    key: string
    value: MasterResume
    indexes: { byUpdatedAt: number }
  }
  resumeVersions: {
    key: string
    value: ResumeVersion
    indexes: { byMasterId: string; byJobKey: string }
  }
  applications: {
    key: string
    value: Application
    indexes: { byJobKey: string; byStatus: string; byUpdatedAt: number }
  }
  jobs: {
    key: string
    value: Job
  }
}

let dbPromise: Promise<IDBPDatabase<BossPassDB>> | null = null

export function getDB(): Promise<IDBPDatabase<BossPassDB>> {
  if (!dbPromise) {
    dbPromise = openDB<BossPassDB>('BossPassDB', 1, {
      upgrade(db) {
        const master = db.createObjectStore('masterResumes', { keyPath: 'id' })
        master.createIndex('byUpdatedAt', 'updatedAt')
        const versions = db.createObjectStore('resumeVersions', { keyPath: 'id' })
        versions.createIndex('byMasterId', 'masterId')
        versions.createIndex('byJobKey', 'jobKey')
        const apps = db.createObjectStore('applications', { keyPath: 'id' })
        apps.createIndex('byJobKey', 'jobKey')
        apps.createIndex('byStatus', 'status')
        apps.createIndex('byUpdatedAt', 'updatedAt')
        db.createObjectStore('jobs', { keyPath: 'key' })
      },
    })
  }
  return dbPromise
}

// ---------- Master Resume ----------

export async function saveMasterResume(master: MasterResume): Promise<void> {
  const db = await getDB()
  await db.put('masterResumes', master)
}

export async function getActiveMasterResume(): Promise<MasterResume | undefined> {
  const db = await getDB()
  const all = await db.getAllFromIndex('masterResumes', 'byUpdatedAt')
  return all.at(-1)
}

export async function listMasterResumes(): Promise<MasterResume[]> {
  const db = await getDB()
  return db.getAllFromIndex('masterResumes', 'byUpdatedAt')
}

export async function deleteMasterResume(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('masterResumes', id)
  const tx = db.transaction('resumeVersions', 'readwrite')
  const idx = tx.store.index('byMasterId')
  for await (const cursor of idx.iterate(id)) {
    await cursor.delete()
  }
  await tx.done
}

// ---------- Resume Versions ----------

export async function saveResumeVersion(version: ResumeVersion): Promise<void> {
  const db = await getDB()
  await db.put('resumeVersions', version)
}

export async function listResumeVersionsByMaster(masterId: string): Promise<ResumeVersion[]> {
  const db = await getDB()
  return db.getAllFromIndex('resumeVersions', 'byMasterId', masterId)
}

export async function listResumeVersionsByJob(jobKey: string): Promise<ResumeVersion[]> {
  const db = await getDB()
  return db.getAllFromIndex('resumeVersions', 'byJobKey', jobKey)
}

export async function getResumeVersion(id: string): Promise<ResumeVersion | undefined> {
  const db = await getDB()
  return db.get('resumeVersions', id)
}

export async function deleteResumeVersion(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('resumeVersions', id)
}

// ---------- Applications ----------

export async function upsertApplication(app: Application): Promise<void> {
  const db = await getDB()
  await db.put('applications', { ...app, updatedAt: Date.now() })
}

export async function getApplicationByJobKey(jobKey: string): Promise<Application | undefined> {
  const db = await getDB()
  const list = await db.getAllFromIndex('applications', 'byJobKey', jobKey)
  return list.at(-1)
}

export async function listApplications(): Promise<Application[]> {
  const db = await getDB()
  return db.getAllFromIndex('applications', 'byUpdatedAt')
}

export async function deleteApplication(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('applications', id)
}

// ---------- Jobs cache ----------

export async function cacheJob(job: Job): Promise<void> {
  const db = await getDB()
  await db.put('jobs', job)
}

export async function getCachedJob(key: string): Promise<Job | undefined> {
  const db = await getDB()
  return db.get('jobs', key)
}
