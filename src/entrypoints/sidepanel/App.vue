<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { initAppState, job, master } from './useAppState'
import JobAnalysis from './components/JobAnalysis.vue'
import ResumeDiff from './components/ResumeDiff.vue'
import GreetingGenerator from './components/GreetingGenerator.vue'
import ChatAssistant from './components/ChatAssistant.vue'
import ResumeUpload from './components/ResumeUpload.vue'
import ModelSettings from './components/ModelSettings.vue'
import ApplicationTracker from './components/ApplicationTracker.vue'

type Tab = 'job' | 'resume' | 'chat' | 'tracker' | 'settings'
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'job', label: '岗位' },
  { key: 'resume', label: '简历' },
  { key: 'chat', label: '聊天' },
  { key: 'tracker', label: '跟踪' },
  { key: 'settings', label: '设置' },
]

const tab = ref<Tab>('job')

onMounted(() => {
  void initAppState()
  // 页面路由变化时刷新岗位
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'bosspass:page-changed') {
      void import('./useAppState').then((m) => m.refreshJob().catch(() => {}))
    }
  })
})
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <!-- Header -->
    <header class="sticky top-0 z-10 border-b border-gray-200 bg-white px-3 py-2">
      <div class="flex items-center justify-between">
        <div>
          <span class="text-sm font-bold text-gray-900">BossPass</span>
          <span class="ml-1 text-[10px] text-gray-400">AI Job Copilot</span>
        </div>
        <div class="flex items-center gap-1 text-[10px]">
          <span v-if="master" class="badge bg-green-50 text-green-700">简历✓</span>
          <span v-if="job" class="badge bg-blue-50 text-blue-700">岗位✓</span>
        </div>
      </div>
      <nav class="mt-1.5 flex gap-1">
        <button
          v-for="t in TABS"
          :key="t.key"
          class="btn flex-1 !py-1"
          :class="tab === t.key ? 'btn-primary' : 'btn-outline'"
          @click="tab = t.key"
        >
          {{ t.label }}
        </button>
      </nav>
    </header>

    <!-- Body -->
    <main class="flex-1 space-y-3 p-3">
      <JobAnalysis v-show="tab === 'job'" />
      <template v-if="tab === 'resume'">
        <ResumeUpload />
        <ResumeDiff />
      </template>
      <template v-if="tab === 'chat'">
        <GreetingGenerator />
        <ChatAssistant />
      </template>
      <ApplicationTracker v-if="tab === 'tracker'" />
      <ModelSettings v-if="tab === 'settings'" />
    </main>

    <footer class="border-t border-gray-100 bg-white px-3 py-1.5 text-center text-[10px] text-gray-300">
      数据仅保存在本地 · AI 输出需人工确认
    </footer>
  </div>
</template>
