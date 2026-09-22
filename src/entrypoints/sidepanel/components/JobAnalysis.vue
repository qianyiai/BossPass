<script setup lang="ts">
import { ref } from 'vue'
import MatchScore from './MatchScore.vue'
import {
  job,
  analysis,
  analyzing,
  runAnalyze,
  refreshJob,
  selectJob,
  visibleJobs,
  connectionError,
  hasProvider,
  master,
} from '../useAppState'
import type { Job } from '@/jobs/schema/job'

const refreshing = ref(false)
const selectingKey = ref('')

async function onRefresh() {
  refreshing.value = true
  try {
    await refreshJob()
  } finally {
    refreshing.value = false
  }
}

async function onSelect(item: Job) {
  selectingKey.value = item.key
  try {
    await selectJob(item)
  } finally {
    selectingKey.value = ''
  }
}

function riskStyle(text: string): string {
  const danger = ['培训贷', '贷款', '先交钱', '押金']
  if (danger.some((d) => text.includes(d))) return 'badge bg-red-50 text-red-700'
  return 'badge bg-amber-50 text-amber-700'
}
</script>

<template>
  <div class="space-y-3">
    <!-- 连接失败：content script 未注入（安装扩展后未刷新页面） -->
    <div v-if="connectionError" class="card border-amber-200 bg-amber-50 text-xs text-amber-800">
      <p class="font-semibold">无法连接 BOSS 页面脚本</p>
      <p class="mt-1 leading-relaxed">最常见原因：安装/更新扩展后，BOSS 页面还是旧页面。请先 <b>刷新（F5）左侧的 zhipin.com 页面</b>，再点下方按钮。</p>
      <p class="mt-1 text-[11px] text-amber-600">{{ connectionError }}</p>
      <button class="btn btn-primary mt-2" :disabled="refreshing" @click="onRefresh">已刷新，重新检测</button>
    </div>

    <!-- 未识别岗位 -->
    <div v-else-if="!job" class="card text-center text-xs text-gray-500">
      <p class="mb-2 font-medium text-gray-700">未选中岗位</p>
      <p class="leading-relaxed">打开 zhipin.com 的<b>岗位详情页</b>会自动识别；或在下方「当前页面岗位」列表中选择一个。</p>
      <button class="btn btn-outline mt-2" :disabled="refreshing" @click="onRefresh">
        {{ refreshing ? '检测中…' : '重新检测' }}
      </button>
    </div>

    <!-- 当前页面岗位列表（列表页/首页） -->
    <template v-if="job">
      <!-- 岗位卡片 -->
      <div class="card">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-gray-900">{{ job.title }}</div>
            <div class="mt-0.5 text-xs text-gray-500">
              {{ job.company.name }}<span v-if="job.company.scale"> · {{ job.company.scale }}</span>
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <span v-if="job.salary" class="badge bg-orange-50 text-orange-600">{{ job.salary }}</span>
              <span v-if="job.location" class="badge bg-gray-100 text-gray-600">{{ job.location }}</span>
              <span v-if="job.experienceRequirement" class="badge bg-gray-100 text-gray-600">{{ job.experienceRequirement }}</span>
              <span v-if="job.educationRequirement" class="badge bg-gray-100 text-gray-600">{{ job.educationRequirement }}</span>
              <span v-if="job.hr.name" class="badge bg-blue-50 text-blue-600">HR: {{ job.hr.name }} {{ job.hr.title }}</span>
            </div>
          </div>
          <button class="btn btn-outline shrink-0" title="重新获取岗位数据" :disabled="refreshing" @click="onRefresh">刷新</button>
        </div>
        <div v-if="job.skills.length" class="mt-2 flex flex-wrap gap-1">
          <span v-for="s in job.skills.slice(0, 12)" :key="s" class="badge bg-blue-50 text-blue-700">{{ s }}</span>
        </div>
        <div v-if="!job.description" class="mt-2 rounded bg-gray-50 px-2 py-1 text-[11px] text-gray-500">
          暂无完整 JD{{ job.securityId ? '' : '（缺少 securityId，建议从详情页打开该岗位）' }}
        </div>
        <details v-if="job.description" class="mt-2">
          <summary class="cursor-pointer text-[11px] text-gray-400">查看 JD 全文</summary>
          <p class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600">{{ job.description }}</p>
        </details>
      </div>

      <!-- 切换岗位：当前页面其他岗位 -->
      <div v-if="visibleJobs.length > 1" class="card">
        <div class="mb-1 text-xs font-semibold text-gray-700">当前页面其他岗位</div>
        <div class="max-h-44 space-y-1 overflow-auto">
          <div v-for="it in visibleJobs" :key="it.key" class="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1">
            <div class="min-w-0 flex-1">
              <div class="truncate text-[11px] font-medium text-gray-800">{{ it.title }}</div>
              <div class="truncate text-[10px] text-gray-400">{{ it.company.name }} · {{ it.salary || '面议' }}</div>
            </div>
            <button
              v-if="it.key !== job.key"
              class="btn btn-outline !px-2 !py-0.5 !text-[10px]"
              :disabled="selectingKey === it.key"
              @click="onSelect(it)"
            >
              {{ selectingKey === it.key ? '获取中…' : '选用' }}
            </button>
            <span v-else class="badge bg-blue-50 text-blue-600">当前</span>
          </div>
        </div>
      </div>
    </template>

    <!-- 列表选择（未选中岗位时） -->
    <div v-if="!job && visibleJobs.length" class="card">
      <div class="mb-1 text-xs font-semibold text-gray-700">当前页面岗位（{{ visibleJobs.length }}）</div>
      <div class="max-h-72 space-y-1 overflow-auto">
        <div v-for="it in visibleJobs" :key="it.key" class="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5">
          <div class="min-w-0 flex-1">
            <div class="truncate text-[11px] font-medium text-gray-800">{{ it.title }}</div>
            <div class="truncate text-[10px] text-gray-400">{{ it.company.name }} · {{ it.salary || '面议' }}<span v-if="it.location"> · {{ it.location }}</span></div>
          </div>
          <button class="btn btn-primary !px-2 !py-0.5 !text-[10px]" :disabled="selectingKey === it.key" @click="onSelect(it)">
            {{ selectingKey === it.key ? '获取中…' : '选用' }}
          </button>
        </div>
      </div>
      <p class="mt-1 text-[10px] text-gray-400">「选用」会自动拉取该岗位完整 JD。</p>
    </div>

    <!-- 分析按钮 -->
    <button v-if="job" class="btn btn-primary w-full" :disabled="analyzing || !master || !hasProvider" @click="runAnalyze">
      <span v-if="analyzing">分析中…（AI 对比简历与 JD）</span>
      <span v-else-if="!master">请先上传简历（「简历」页）</span>
      <span v-else-if="!hasProvider">请先配置 AI（「设置」页）</span>
      <span v-else>{{ analysis ? '重新分析岗位' : '分析岗位' }}</span>
    </button>

    <!-- 分析结果 -->
    <div v-if="job && analysis" class="card">
      <MatchScore :analysis="analysis" />
      <div v-if="analysis.jobRisks.length" class="mt-3 border-t border-gray-100 pt-2">
        <div class="label !mb-1">⚠️ 岗位风险（仅供参考）</div>
        <div class="flex flex-col gap-1">
          <span v-for="(r, i) in analysis.jobRisks" :key="i" :class="riskStyle(r)">{{ r }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
