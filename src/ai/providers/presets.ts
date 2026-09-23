import type { AIProvider } from '@/storage/settings'

/**
 * 常见 OpenAI 兼容服务预设。
 * 默认模型与快选列表同步自 https://models.dev（开源模型库，2026-09 数据），
 * 运行时可点「在线获取」拉取当天最新列表（见 providers/modelsdev.ts）。
 */
export interface ProviderPreset {
  label: string
  baseURL: string
  model: string
  /** 输入框快选列表（models.dev 同步） */
  models: string[]
  /** models.dev 的 provider id，用于在线拉取最新模型列表 */
  modelsDevKey?: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    label: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    model: 'gpt-6-sol',
    models: ['gpt-6-sol', 'gpt-6-luna', 'gpt-5.6', 'gpt-5.4-mini', 'gpt-5.4-nano'],
    modelsDevKey: 'openai',
  },
  {
    label: 'DeepSeek',
    baseURL: 'https://api.deepseek.com',
    model: 'deepseek-v4-pro',
    models: ['deepseek-v4-pro', 'deepseek-v4-flash', 'deepseek-flash'],
    modelsDevKey: 'deepseek',
  },
  {
    label: 'Kimi (Moonshot)',
    baseURL: 'https://api.moonshot.cn/v1',
    model: 'kimi-k3',
    models: ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.6'],
    modelsDevKey: 'moonshotai',
  },
  {
    label: 'GLM (智谱)',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-5.3',
    models: ['glm-5.3', 'glm-5.3-flashx', 'glm-5.3-flash'],
    modelsDevKey: 'zhipuai',
  },
  {
    label: 'Qwen (通义)',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen3.8-max',
    models: ['qwen3.8-max', 'qwen3.8-flash', 'qwen3.7-plus'],
    modelsDevKey: 'alibaba',
  },
  {
    label: 'OpenRouter',
    baseURL: 'https://openrouter.ai/api/v1',
    model: 'openai/gpt-6-sol',
    models: [
      'openai/gpt-6-sol',
      'openai/gpt-6-luna',
      'anthropic/claude-opus-5.5',
      'xiaomi/mimo-v2.6-pro',
    ],
    modelsDevKey: 'openrouter',
  },
  {
    label: 'Grok (xAI)',
    baseURL: 'https://api.x.ai/v1',
    model: 'grok-4.7',
    models: ['grok-4.7', 'grok-4.6', 'grok-4.5'],
    modelsDevKey: 'xai',
  },
  {
    label: 'Gemini (OpenAI 兼容)',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-3.8-flash',
    models: ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.5-flash-lite'],
    modelsDevKey: 'google',
  },
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

/** 按 baseURL 匹配预设（编辑已有 Provider 时找在线列表用） */
export function findPresetByBaseURL(baseURL: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((p) => p.baseURL === baseURL)
}
