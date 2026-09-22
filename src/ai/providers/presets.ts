import type { AIProvider } from '@/storage/settings'

/** 常见 OpenAI 兼容服务预设（新增 Provider 时快速填表） */
export interface ProviderPreset {
  label: string
  baseURL: string
  model: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { label: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { label: 'DeepSeek', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { label: 'Kimi (Moonshot)', baseURL: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
  { label: 'GLM (智谱)', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { label: 'Qwen (通义)', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', model: 'openai/gpt-4o-mini' },
]

export function presetToProvider(preset: ProviderPreset): Omit<AIProvider, 'id'> {
  return {
    name: preset.label,
    baseURL: preset.baseURL,
    apiKey: '',
    model: preset.model,
    temperature: 0.4,
    timeoutMs: 120000,
  }
}
