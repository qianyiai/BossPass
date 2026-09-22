<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { settings, reloadSettings, persistSettings } from '../useAppState'
import { PROVIDER_PRESETS } from '@/ai/providers/presets'
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

async function saveProvider() {
  if (!editing.value || !settings.value) return
  saving.value = true
  try {
    const p = editing.value
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
</script>

<template>
  <div class="space-y-3">
    <!-- Provider 列表 -->
    <div class="card space-y-2">
      <div class="flex items-center justify-between">
        <span class="text-xs font-semibold">AI Provider（OpenAI 兼容）</span>
        <div class="flex gap-1">
          <button class="btn btn-outline !py-1" @click="newCustom">+ 自定义</button>
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
          <span class="label">模型</span>
          <input v-model="editing.model" class="input" />
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
