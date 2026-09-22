import { createOpenAI } from '@ai-sdk/openai'
import type { LanguageModel } from 'ai'
import type { AIProvider } from '@/storage/settings'

/**
 * OpenAI 兼容 Provider 工厂（参考 boss-helper 的 useModel/openai.ts 设计）。
 * 支持 OpenAI / DeepSeek / Kimi / GLM / Qwen / OpenRouter 及任意兼容端点。
 */
export function createProviderModel(p: AIProvider): LanguageModel {
  const factory = createOpenAI({
    baseURL: p.baseURL,
    apiKey: p.apiKey,
    name: 'bosspass-compatible',
  })
  return factory.chat(p.model)
}
