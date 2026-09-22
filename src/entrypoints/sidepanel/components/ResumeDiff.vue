<script setup lang="ts">
import { ref } from 'vue'
import {
  optimizing,
  pendingChanges,
  optimizedResume,
  scoreAfterOptimize,
  runOptimize,
  saveOptimizedVersion,
  gaps,
  submitGapFact,
  ignoreGap,
  job,
  master,
  hasProvider,
} from '../useAppState'
import { exportResumePdf } from '@/resume/renderer/pdf'
import { resumePlainText } from '@/resume/renderer/pdf'

const saving = ref(false)
const savedTip = ref('')

async function onSave() {
  saving.value = true
  savedTip.value = ''
  try {
    const v = await saveOptimizedVersion()
    savedTip.value = v ? `已保存版本：${v.jobTitle}（${v.company}）` : ''
  } catch (e) {
    savedTip.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

function copyPlain() {
  if (optimizedResume.value) {
    void navigator.clipboard.writeText(resumePlainText(optimizedResume.value))
    savedTip.value = '已复制 ATS 纯文本简历'
  }
}
</script>

<template>
  <div class="space-y-3">
    <button
      class="btn btn-primary w-full"
      :disabled="optimizing || !job || !master || !hasProvider"
      @click="runOptimize"
    >
      <span v-if="optimizing">AI 优化中…</span>
      <span v-else>为当前岗位优化简历</span>
    </button>

    <!-- 缺失能力反编造交互 -->
    <div v-if="gaps.length" class="card space-y-2 border-amber-200 bg-amber-50">
      <div class="text-xs font-semibold text-amber-700">岗位需要以下能力，但你的资料中没有发现相关经历</div>
      <div v-for="(g, i) in gaps" :key="g.skill" class="rounded-lg border border-amber-200 bg-white p-2">
        <div class="text-[11px] text-gray-700">
          <b>{{ g.skill }}</b> — {{ g.question }}
        </div>
        <textarea
          v-model="g.answer"
          rows="2"
          class="input mt-1"
          placeholder="例如：哪个项目？做了什么？使用多久？产生什么结果？（不填或点忽略则不会写入简历）"
        ></textarea>
        <div class="mt-1 flex gap-2">
          <button class="btn btn-primary" :disabled="!g.answer.trim()" @click="submitGapFact(i)">补充我的真实经历</button>
          <button class="btn btn-outline" @click="ignoreGap(i)">忽略</button>
        </div>
      </div>
    </div>

    <!-- Diff 审阅 -->
    <div v-if="pendingChanges.length" class="card space-y-2">
      <div class="flex items-center justify-between">
        <div class="text-xs font-semibold">
          修改审阅
          <span class="ml-1 text-gray-400">{{ pendingChanges.filter((c) => c.status === 'accepted').length }}/{{ pendingChanges.length }} 已接受</span>
        </div>
        <div v-if="scoreAfterOptimize != null" class="badge bg-green-50 text-green-700">预计 {{ scoreAfterOptimize }}%</div>
      </div>
      <div
        v-for="(c, i) in pendingChanges"
        :key="c.path + i"
        class="rounded-lg border p-2"
        :class="c.status === 'accepted' ? 'border-green-200 bg-green-50/40' : c.status === 'rejected' ? 'border-gray-200 bg-gray-50 opacity-60' : 'border-gray-200'"
      >
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-medium text-gray-700">{{ c.label }}</span>
          <div class="flex gap-1">
            <button class="btn !px-2 !py-0.5" :class="c.status === 'accepted' ? 'btn-primary' : 'btn-outline'" @click="c.status = 'accepted'">接受</button>
            <button class="btn !px-2 !py-0.5" :class="c.status === 'rejected' ? 'btn-danger' : 'btn-outline'" @click="c.status = 'rejected'">拒绝</button>
          </div>
        </div>
        <div class="mt-1 grid grid-cols-1 gap-1 text-[11px] leading-relaxed">
          <div class="rounded bg-red-50 px-1.5 py-1 text-red-800 line-through decoration-red-300">{{ c.before || '（新增）' }}</div>
          <div class="rounded bg-green-50 px-1.5 py-1 text-green-800">{{ c.after }}</div>
          <div v-if="c.reason" class="text-gray-500">原因：{{ c.reason }}</div>
        </div>
      </div>
      <div class="flex gap-2 pt-1">
        <button class="btn btn-primary flex-1" :disabled="saving" @click="onSave">
          {{ saving ? '保存中…' : '保存为岗位版本' }}
        </button>
        <button v-if="optimizedResume" class="btn btn-outline" @click="exportResumePdf(optimizedResume)">导出 PDF</button>
      </div>
      <button v-if="optimizedResume" class="btn btn-outline w-full" @click="copyPlain">复制 ATS 纯文本</button>
      <div v-if="savedTip" class="text-[11px] text-green-600">{{ savedTip }}</div>
      <p class="text-[10px] leading-relaxed text-gray-400">Master Resume 永不覆盖，优化结果保存为独立版本。</p>
    </div>
  </div>
</template>
