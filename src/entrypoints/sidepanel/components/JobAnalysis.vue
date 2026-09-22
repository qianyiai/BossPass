<script setup lang="ts">
import MatchScore from './MatchScore.vue'
import { job, analysis, analyzing, runAnalyze, refreshJob, hasProvider, master } from '../useAppState'

const refreshing = analyzing

function riskStyle(text: string): string {
  const danger = ['培训贷', '贷款', '先交钱', '押金']
  if (danger.some((d) => text.includes(d))) return 'badge bg-red-50 text-red-700'
  return 'badge bg-amber-50 text-amber-700'
}
</script>

<template>
  <div class="space-y-3">
    <!-- 未连接提示 -->
    <div v-if="!job" class="card text-center text-xs text-gray-500">
      <p class="mb-2 font-medium text-gray-700">未识别到 BOSS 岗位</p>
      <p class="leading-relaxed">请打开 zhipin.com 的岗位详情页（job_detail），然后点击刷新。</p>
      <button class="btn btn-outline mt-2" :disabled="refreshing" @click="refreshJob">重新检测</button>
    </div>

    <template v-else>
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
          <button class="btn btn-outline shrink-0" title="重新获取岗位数据" :disabled="refreshing" @click="refreshJob">刷新</button>
        </div>
        <div v-if="job.skills.length" class="mt-2 flex flex-wrap gap-1">
          <span v-for="s in job.skills.slice(0, 12)" :key="s" class="badge bg-blue-50 text-blue-700">{{ s }}</span>
        </div>
        <details v-if="job.description" class="mt-2">
          <summary class="cursor-pointer text-[11px] text-gray-400">查看 JD 全文</summary>
          <p class="mt-1 max-h-40 overflow-auto whitespace-pre-wrap text-[11px] leading-relaxed text-gray-600">{{ job.description }}</p>
        </details>
      </div>

      <!-- 分析按钮 -->
      <button class="btn btn-primary w-full" :disabled="analyzing || !master || !hasProvider" @click="runAnalyze">
        <span v-if="analyzing">分析中…（AI 对比简历与 JD）</span>
        <span v-else-if="!master">请先上传简历（「简历」页）</span>
        <span v-else-if="!hasProvider">请先配置 AI（「设置」页）</span>
        <span v-else>{{ analysis ? '重新分析岗位' : '分析岗位' }}</span>
      </button>

      <!-- 分析结果 -->
      <div v-if="analysis" class="card">
        <MatchScore :analysis="analysis" />
        <div v-if="analysis.jobRisks.length" class="mt-3 border-t border-gray-100 pt-2">
          <div class="label !mb-1">⚠️ 岗位风险（仅供参考）</div>
          <div class="flex flex-col gap-1">
            <span v-for="(r, i) in analysis.jobRisks" :key="i" :class="riskStyle(r)">{{ r }}</span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>
