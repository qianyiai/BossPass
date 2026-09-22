import { generateObject, generateText } from 'ai'
import type { z } from 'zod'
import { createProviderModel } from '@/ai/providers/openai'
import { loadSettings, pickProvider, type TaskKind } from '@/storage/settings'
import { logger } from '@/utils/logger'

export class AIConfigError extends Error {}
export class AIOutputError extends Error {}

async function resolveModel(task: TaskKind) {
  const settings = await loadSettings()
  const provider = pickProvider(settings, task)
  if (!provider) {
    throw new AIConfigError('尚未配置 AI Provider，请先在「设置」中添加（任意 OpenAI 兼容 API）')
  }
  if (!provider.apiKey) {
    throw new AIConfigError(`「${provider.name}」未填写 API Key`)
  }
  return {
    model: createProviderModel(provider),
    provider,
  }
}

function stripFences(text: string): string {
  const trimmed = text.trim()
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  return (fence?.[1] ?? trimmed).trim()
}

export function parseJsonLoose<T>(text: string, schema: z.ZodType<T>): T {
  const cleaned = stripFences(text)
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new AIOutputError(`AI 输出中没有 JSON：${cleaned.slice(0, 120)}`)
  const candidate = cleaned.slice(start)
  let parsed: unknown
  try {
    parsed = JSON.parse(candidate)
  } catch {
    // 尝试截到最后一个闭合括号
    const lastBrace = Math.max(candidate.lastIndexOf('}'), candidate.lastIndexOf(']'))
    if (lastBrace > 0) {
      parsed = JSON.parse(candidate.slice(0, lastBrace + 1))
    } else {
      throw new AIOutputError(`AI 输出 JSON 解析失败：${cleaned.slice(0, 200)}`)
    }
  }
  const result = schema.safeParse(parsed)
  if (!result.success) {
    throw new AIOutputError(`AI 输出不符合预期结构：${result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  return result.data
}

/** 结构化输出：优先 generateObject，失败降级为 generateText + 手动解析 */
export async function runStructured<T>(
  task: TaskKind,
  schema: z.ZodType<T>,
  opts: { system: string; user: string },
): Promise<T> {
  const { model, provider } = await resolveModel(task)
  const abort = AbortSignal.timeout(provider.timeoutMs)
  try {
    const { object } = await generateObject({
      model,
      schema,
      system: opts.system,
      prompt: opts.user,
      temperature: provider.temperature,
      abortSignal: abort,
    })
    return object
  } catch (e) {
    if (e instanceof AIConfigError) throw e
    logger.warn('generateObject failed, fallback to text JSON:', e)
    const { text } = await generateText({
      model,
      system: `${opts.system}\n\n重要：只输出符合要求的 JSON，不要输出任何解释或 markdown 代码块。`,
      prompt: opts.user,
      temperature: provider.temperature,
      abortSignal: abort,
    })
    return parseJsonLoose(text, schema)
  }
}

/** 文本输出（打招呼/回复/跟进等短文本） */
export async function runText(
  task: TaskKind,
  opts: { system: string; user: string; maxTokens?: number },
): Promise<string> {
  const { model, provider } = await resolveModel(task)
  const { text } = await generateText({
    model,
    system: opts.system,
    prompt: opts.user,
    temperature: provider.temperature,
    maxOutputTokens: opts.maxTokens ?? 800,
    abortSignal: AbortSignal.timeout(provider.timeoutMs),
  })
  return text.trim()
}

export { resolveModel }
