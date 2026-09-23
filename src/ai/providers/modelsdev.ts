import { logger } from '@/utils/logger'

/**
 * models.dev 在线模型目录（https://github.com/anomalyco/models.dev）。
 * 拉取全量 API 数据（24h 缓存到 chrome.storage.local），按 provider 过滤模型列表。
 * manifest 已加 https://models.dev/* host_permission 以绕过 CORS。
 */

const API_URL = 'https://models.dev/api.json'
const CACHE_KEY = 'modelsdev-models-cache'
const CACHE_TTL = 24 * 60 * 60 * 1000

export interface ModelOption {
  id: string
  name: string
}

interface CacheEntry {
  time: number
  data: Record<string, ModelOption[]>
}

async function readCache(): Promise<CacheEntry | null> {
  try {
    const v = (await chrome.storage.local.get(CACHE_KEY))[CACHE_KEY] as CacheEntry | undefined
    if (v && Date.now() - v.time < CACHE_TTL && v.data && Object.keys(v.data).length > 0) return v
  } catch {
    /* ignore */
  }
  return null
}

async function writeCache(data: Record<string, ModelOption[]>): Promise<void> {
  try {
    await chrome.storage.local.set({ [CACHE_KEY]: { time: Date.now(), data } })
  } catch {
    /* 缓存失败不影响功能 */
  }
}

let inflight: Promise<Record<string, ModelOption[]>> | null = null

/** 拉取 models.dev 全量目录（带缓存与并发去重） */
export async function fetchModelsDevCatalog(): Promise<Record<string, ModelOption[]>> {
  const cached = await readCache()
  if (cached) return cached.data
  if (inflight) return inflight
  inflight = (async () => {
    const res = await fetch(API_URL, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) throw new Error(`models.dev HTTP ${res.status}`)
    const raw = (await res.json()) as Record<
      string,
      { models?: Record<string, { id?: string; name?: string }> }
    >
    const out: Record<string, ModelOption[]> = {}
    for (const [pid, prov] of Object.entries(raw)) {
      const models = Object.values(prov.models ?? {})
        .filter((m) => m.id && !/deprecated/i.test(m.id))
        .map((m) => ({ id: m.id as string, name: m.name ?? (m.id as string) }))
      models.sort((a, b) => a.id.localeCompare(b.id))
      if (models.length) out[pid] = models
    }
    await writeCache(out)
    return out
  })()
  try {
    return await inflight
  } catch (e) {
    logger.warn('models.dev 拉取失败', e)
    throw e
  } finally {
    inflight = null
  }
}

/** 获取指定 provider 的模型选项 */
export async function fetchModelOptions(modelsDevKey: string): Promise<ModelOption[]> {
  const catalog = await fetchModelsDevCatalog()
  return catalog[modelsDevKey] ?? []
}
