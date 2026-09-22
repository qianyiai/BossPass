import { z } from 'zod'
import { logger, randomId } from '@/utils/logger'

/**
 * 配置存储（chrome.storage.sync）：AI Provider、任务-模型分配、打招呼风格。
 * 大数据（简历/申请）在 IndexedDB，见 storage/db.ts。
 */

export const AIProviderSchema = z.object({
  id: z.string(),
  name: z.string(),
  baseURL: z.string().url(),
  apiKey: z.string(),
  model: z.string(),
  temperature: z.number().min(0).max(2).default(0.4),
  timeoutMs: z.number().min(5000).max(600000).default(120000),
})
export type AIProvider = z.infer<typeof AIProviderSchema>

export type TaskKind = 'analyze' | 'resume' | 'greeting' | 'chat' | 'parse'

export const GreetingStyleSchema = z.object({
  tone: z.enum(['natural', 'concise', 'professional', 'proactive', 'tech', 'product']).default('natural'),
  maxLength: z.number().min(30).max(500).default(120),
  addressHR: z.boolean().default(true),
  mentionCompany: z.boolean().default(true),
  mentionProject: z.boolean().default(true),
})
export type GreetingStyle = z.infer<typeof GreetingStyleSchema>

export interface Settings {
  providers: AIProvider[]
  /** 每类任务使用的 provider id；空字符串 = 使用第一个 */
  taskModels: Record<TaskKind, string>
  defaultProviderId: string
  greeting: GreetingStyle
}

export const DEFAULT_SETTINGS: Settings = {
  providers: [],
  taskModels: { analyze: '', resume: '', greeting: '', chat: '', parse: '' },
  defaultProviderId: '',
  greeting: {
    tone: 'natural',
    maxLength: 120,
    addressHR: true,
    mentionCompany: true,
    mentionProject: true,
  },
}

const SETTINGS_KEY = 'settings'

export async function loadSettings(): Promise<Settings> {
  try {
    const raw = (await chrome.storage.sync.get(SETTINGS_KEY))[SETTINGS_KEY] as
      | Partial<Settings>
      | undefined
    if (!raw) return structuredClone(DEFAULT_SETTINGS)
    return {
      ...structuredClone(DEFAULT_SETTINGS),
      ...raw,
      taskModels: { ...DEFAULT_SETTINGS.taskModels, ...(raw.taskModels ?? {}) },
      greeting: { ...DEFAULT_SETTINGS.greeting, ...(raw.greeting ?? {}) },
    }
  } catch (e) {
    logger.error('loadSettings failed', e)
    return structuredClone(DEFAULT_SETTINGS)
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  await chrome.storage.sync.set({ [SETTINGS_KEY]: settings })
}

export async function addProvider(p: Omit<AIProvider, 'id'>): Promise<Settings> {
  const s = await loadSettings()
  const provider: AIProvider = { ...p, id: randomId('prov') }
  s.providers.push(provider)
  if (!s.defaultProviderId) {
    s.defaultProviderId = provider.id
  }
  await saveSettings(s)
  return s
}

export async function updateProvider(provider: AIProvider): Promise<Settings> {
  const s = await loadSettings()
  const idx = s.providers.findIndex((p) => p.id === provider.id)
  if (idx >= 0) s.providers[idx] = provider
  await saveSettings(s)
  return s
}

export async function removeProvider(id: string): Promise<Settings> {
  const s = await loadSettings()
  s.providers = s.providers.filter((p) => p.id !== id)
  if (s.defaultProviderId === id) s.defaultProviderId = s.providers[0]?.id ?? ''
  for (const k of Object.keys(s.taskModels) as TaskKind[]) {
    if (s.taskModels[k] === id) s.taskModels[k] = ''
  }
  await saveSettings(s)
  return s
}

export function pickProvider(settings: Settings, task: TaskKind): AIProvider | undefined {
  const byTask = settings.taskModels[task]
  return (
    settings.providers.find((p) => p.id === byTask) ??
    settings.providers.find((p) => p.id === settings.defaultProviderId) ??
    settings.providers[0]
  )
}
