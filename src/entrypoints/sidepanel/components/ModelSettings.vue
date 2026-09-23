<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { settings, reloadSettings, persistSettings } from '../useAppState'
import { findPresetByBaseURL, PROVIDER_PRESETS } from '@/ai/providers/presets'
import { fetchModelOptions, type ModelOption } from '@/ai/providers/modelsdev'
import type { AIProvider, TaskKind } from '@/storage/settings'

const editing = ref<AIProvider | null>(null)
const saving = ref(false)
const testResult = ref('')

const TASKS: Array<{ key: TaskKind; label: string }> = [
  { key: 'analyze', label: '岗位分析' },
  { key: 'resume', label: '简历优化' },
  { key: 'greeting', label: '打招呼' },
  { key: 'chat', label: '聊天辅助' },
  { key: 'parse', label: '简历解析' },
]

const TONES = [
  { v: 'natural', l: '自然' },
  { v: 'concise', l: '简洁' },
  { v: 'professional', l: '专业' },
  { v: 'proactive', l: '主动' },
  { v: 'tech', l: '技术型' },
  { v: 'product', l: '产品型' },
]

function newFromPreset(presetIndex: number) {
  const p = PROVIDER_PRESETS[presetIndex]
  if (!p) return
  editing.value = {
    id: '',
    name: p.label,
    baseURL: p.baseURL,
    apiKey: '',
    model: p.model,
    temperature: 0.4,
    timeoutMs: 120000,
  }
}

function newCustom() {
  editing.value = { id: '', name: '自定义', baseURL: 'https://api.openai.com/v1', apiKey: '', model: 'gpt-4o-mini', temperature: 0.4, timeoutMs: 120000 }
}

function edit(p: AIProvider) {
  editing.value = structuredClone(p)
}

// 模型快选列表：预设内置（models.dev 同步）+ 可在线拉取当天最新
const modelOptions = ref<ModelOption[]>([])
const loadingModels = ref(false)

function seedModelOptions() {
  const preset = editing.value ? findPresetByBaseURL(editing.value.baseURL) : undefined
  modelOptions.value = (preset?.models ?? []).map((id) => ({ id, name: id }))
}
watch(editing, seedModelOptions, { immediate: true })

async function loadOnlineModels() {
  const e = editing.value
  if (!e) return
  const preset = findPresetByBaseURL(e.baseURL)
  if (!preset?.modelsDevKey) {
    testResult.value = '自定义端点没有在线模型列表，请手动输入模型 ID'
    return
  }
  loadingModels.value = true
  try {
    const opts = await fetchModelOptions(preset.modelsDevKey)
    if (!opts.length) {
      testResult.value = 'models.dev 上没有该 Provider 的模型数据'
      return
    }
    modelOptions.value = opts
    testResult.value = `✓ 已获取 ${opts.length} 个模型，点击「模型」输入框下拉选择`
  } catch (err) {
    testResult.value = `获取失败：${err instanceof Error ? err.message : String(err)}`
  } finally {
    loadingModels.value = false
  }
}

async function saveProvider() {
  if (!editing.value || !settings.value) return
  saving.value = true
  try {
    const p = editing.value
    if (!Array.isArray(settings.value.providers)) settings.value.providers = []
    if (p.id) {
      const idx = settings.value.providers.findIndex((x) => x.id === p.id)
      if (idx >= 0) settings.value.providers[idx] = p
    } else {
      p.id = `prov_${Date.now().toString(36)}`
      settings.value.providers.push(p)
      if (!settings.value.defaultProviderId) settings.value.defaultProviderId = p.id
    }
    await persistSettings(settings.value)
    editing.value = null
    testResult.value = '已保存'
  } finally {
    saving.value = false
  }
}

async function del(p: AIProvider) {
  if (!settings.value) return
  if (!Array.isArray(settings.value.providers)) settings.value.providers = []
  settings.value.providers = settings.value.providers.filter((x) => x.id !== p.id)
  if (settings.value.defaultProviderId === p.id) settings.value.defaultProviderId = settings.value.providers[0]?.id ?? ''
  for (const k of Object.keys(settings.value.taskModels) as TaskKind[]) {
    if (settings.value.taskModels[k] === p.id) settings.value.taskModels[k] = ''
  }
  await persistSettings(settings.value)
}

async function testProvider(p: AIProvider) {
  testResult.value = '测试中…'
  try {
    const res = await fetch(p.baseURL.replace(/\/$/, '') + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.apiKey}` },
      body: JSON.stringify({ model: p.model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
    })
    testResult.value = res.ok ? '✓ 连接成功' : `✗ HTTP ${res.status}`
  } catch (e) {
    testResult.value = `✗ ${e instanceof Error ? e.message : String(e)}`
  }
}

onMounted(() => void reloadSettings())

/** 自救：清除可能损坏的本地配置并重新加载 */
async function resetAll() {
  if (!window.confirm('确定清除全部 AI 配置（Provider / 任务模型分配 / 打招呼风格）并重新开始？')) return
  try {
    await chrome.storage.sync.remove('settings')
    await chrome.storage.local.remove('settings')
  } catch {
    /* ignore */
  }
  await reloadSettings()
  testResult.value = '已重置，请重新添加 Provider'
}
</script>

<template>
  <div class="space-y-3">
    <!-- Provider 列表 -->
    <div class="card space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold">AI Provider（OpenAI 兼容）</span>
        <div class="flex gap-1">
          <button class="btn btn-outline !py-1" @click="newCustom">+ 自定义</button>
          <button class="btn btn-outline !py-1 !text-red-500" title="配置异常时的自救按钮" @click="resetAll">重置</button>
        </div>
      </div>
      <div class="flex flex-wrap gap-1">
        <button v-for="(p, i) in PROVIDER_PRESETS" :key="p.label" class="btn btn-outline !py-1 !text-[11px]" @click="newFromPreset(i)">
          + {{ p.label }}
        </button>
      </div>

      <div v-for="p in settings?.providers ?? []" :key="p.id" class="rounded-lg border border-gray-200 p-2">
        <div class="flex items-center justify-between">
          <div class="text-xs font-medium">
            {{ p.name }} <span class="text-gray-400">{{ p.model }}</span>
            <span v-if="settings?.defaultProviderId === p.id" class="badge ml-1 bg-blue-50 text-blue-600">默认</span>
          </div>
          <div class="flex gap-1">
            <button class="btn btn-outline !px-2 !py-0.5" @click="testProvider(p)">测试</button>
            <button class="btn btn-outline !px-2 !py-0.5" @click="edit(p)">编辑</button>
            <button class="btn btn-danger !px-2 !py-0.5" @click="del(p)">删除</button>
          </div>
        </div>
        <div class="truncate text-[10px] text-gray-400">{{ p.baseURL }}</div>
      </div>
      <div v-if="!settings?.providers.length" class="text-[11px] text-gray-400">尚未添加 Provider。点上方按钮快速创建。</div>
    </div>

    <!-- 编辑表单 -->
    <div v-if="editing" class="card space-y-2">
      <div>
        <span class="label">名称</span>
        <input v-model="editing.name" class="input" />
      </div>
      <div>
        <span class="label">Base URL</span>
        <input v-model="editing.baseURL" class="input" />
      </div>
      <div>
        <span class="label">API Key</span>
        <input v-model="editing.apiKey" type="password" class="input" />
      </div>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <div class="flex items-center justify-between">
            <span class="label !mb-0">模型</span>
            <button
              class="text-[10px] text-blue-500 hover:underline disabled:opacity-50"
              :disabled="loadingModels"
              @click="loadOnlineModels"
            >
              {{ loadingModels ? '获取中…' : '⟳ 在线获取最新' }}
            </button>
          </div>
          <input v-model="editing.model" class="input mt-0.5" list="bosspass-model-options" placeholder="点击上方可拉取 models.dev 最新列表" />
          <datalist id="bosspass-model-options">
            <option v-for="m in modelOptions" :key="m.id" :value="m.id">{{ m.name }}</option>
          </datalist>
        </div>
        <div>
          <span class="label">Temperature</span>
          <input v-model.number="editing.temperature" type="number" step="0.1" min="0" max="2" class="input" />
        </div>
      </div>
      <div class="flex gap-2">
        <button class="btn btn-primary flex-1" :disabled="saving" @click="saveProvider">保存</button>
        <button class="btn btn-outline" @click="editing = null">取消</button>
      </div>
    </div>

    <div v-if="testResult" class="text-[11px] text-gray-600">{{ testResult }}</div>

    <!-- 任务模型分配 -->
    <div class="card space-y-2">
      <div class="text-xs font-semibold">按任务分配模型</div>
      <div v-for="t in TASKS" :key="t.key" class="flex items-center justify-between">
        <span class="text-[11px] text-gray-600">{{ t.label }}</span>
        <select
          class="input !w-40"
          :value="settings?.taskModels[t.key] ?? ''"
          @change="settings && persistSettings({ ...settings, taskModels: { ...settings.taskModels, [t.key]: ($event.target as HTMLSelectElement).value } })"
        >
          <option value="">默认</option>
          <option v-for="p in settings?.providers ?? []" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
      </div>
    </div>

    <!-- 打招呼风格 -->
    <div class="card space-y-2" v-if="settings">
      <div class="text-xs font-semibold">打招呼风格</div>
      <div>
        <span class="label">语气</span>
        <select class="input" :value="settings.greeting.tone" @change="persistSettings({ ...settings, greeting: { ...settings.greeting, tone: ($event.target as HTMLSelectElement).value as typeof settings.greeting.tone } })">
          <option v-for="t in TONES" :key="t.v" :value="t.v">{{ t.l }}</option>
        </select>
      </div>
      <div>
        <span class="label">最大长度（字）</span>
        <input type="number" :value="settings.greeting.maxLength" min="30" max="500" class="input" @change="persistSettings({ ...settings, greeting: { ...settings.greeting, maxLength: Number(($event.target as HTMLInputElement).value) || 120 } })" />
      </div>
      <div class="flex gap-3 text-[11px] text-gray-600">
        <label class="flex items-center gap-1"><input type="checkbox" :checked="settings.greeting.addressHR" @change="persistSettings({ ...settings, greeting: { ...settings.greeting, addressHR: ($event.target as HTMLInputElement).checked } })" />称呼 HR</label>
        <label class="flex items-center gap-1"><input type="checkbox" :checked="settings.greeting.mentionCompany" @change="persistSettings({ ...settings, greeting: { ...settings.greeting, mentionCompany: ($event.target as HTMLInputElement).checked } })" />提公司</label>
        <label class="flex items-center gap-1"><input type="checkbox" :checked="settings.greeting.mentionProject" @change="persistSettings({ ...settings, greeting: { ...settings.greeting, mentionProject: ($event.target as HTMLInputElement).checked } })" />提项目</label>
      </div>
    </div>
  </div>
</template>
