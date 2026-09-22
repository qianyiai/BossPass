<script setup lang="ts">
import { ref } from 'vue'
import { master, uploadResumePdf } from '../useAppState'
import type { UserFactProfile } from '@/resume/schema/resume'

const uploading = ref(false)
const error = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  uploading.value = true
  error.value = ''
  try {
    await uploadResumePdf(file)
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err)
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function updateFact<K extends keyof UserFactProfile>(key: K, value: UserFactProfile[K]) {
  if (master.value) master.value.factProfile[key] = value
}
</script>

<template>
  <div class="space-y-3">
    <!-- 上传 -->
    <div class="card">
      <input ref="fileInput" type="file" accept="application/pdf,.pdf" class="hidden" @change="onFile" />
      <button class="btn btn-primary w-full" :disabled="uploading" @click="fileInput?.click()">
        {{ uploading ? '解析中（提取文本 → AI 结构化）…' : master ? '重新上传 PDF 简历' : '上传 PDF 简历' }}
      </button>
      <p class="mt-1 text-center text-[10px] text-gray-400">PDF 文本将解析为结构化 Master Resume，全部保存在本地</p>
      <div v-if="error" class="mt-1 text-[11px] text-red-500">{{ error }}</div>
    </div>

    <template v-if="master">
      <!-- Master Resume 概览 -->
      <div class="card">
        <div class="mb-1 flex items-center justify-between">
          <span class="text-xs font-semibold">Master Resume</span>
          <span class="badge bg-green-50 text-green-700">{{ master.resume.experience.length }} 段经历 · {{ master.resume.skills.length }} 技能</span>
        </div>
        <div class="text-xs text-gray-800">{{ master.resume.profile.name || '（未识别姓名）' }}</div>
        <div class="text-[11px] text-gray-500">{{ master.resume.profile.email }} {{ master.resume.profile.phone }}</div>
        <p v-if="master.resume.summary" class="mt-1 line-clamp-3 text-[11px] leading-relaxed text-gray-600">{{ master.resume.summary }}</p>
        <details class="mt-1">
          <summary class="cursor-pointer text-[11px] text-gray-400">查看经历明细</summary>
          <div v-for="(e, i) in master.resume.experience" :key="i" class="mt-1 text-[11px]">
            <b>{{ e.title }}</b> @ {{ e.company }} ({{ e.startDate }} ~ {{ e.endDate }})
          </div>
        </details>
      </div>

      <!-- 事实库编辑 -->
      <div class="card space-y-2">
        <div class="text-xs font-semibold">User Fact Profile（AI 的事实基础，禁止编造）</div>
        <div>
          <span class="label">技能（逗号分隔）</span>
          <textarea
            :value="master.factProfile.skills.join('、')"
            rows="2"
            class="input"
            @change="updateFact('skills', ($event.target as HTMLTextAreaElement).value.split(/[,，、]/).map((s: string) => s.trim()).filter(Boolean))"
          ></textarea>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <div>
            <span class="label">所在地</span>
            <input :value="master.factProfile.location" class="input" @change="updateFact('location', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <span class="label">可到岗时间</span>
            <input :value="master.factProfile.availableFrom" class="input" @change="updateFact('availableFrom', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <span class="label">期望薪资</span>
            <input :value="master.factProfile.expectedSalary" class="input" @change="updateFact('expectedSalary', ($event.target as HTMLInputElement).value)" />
          </div>
          <div>
            <span class="label">工作年限</span>
            <input :value="master.factProfile.yearsOfExperience" class="input" @change="updateFact('yearsOfExperience', ($event.target as HTMLInputElement).value)" />
          </div>
        </div>

        <div>
          <div class="label">常见问题既定答案</div>
          <div v-for="(qa, i) in master.factProfile.qaNotes" :key="i" class="mb-1 flex gap-1">
            <input :value="qa.question" class="input" placeholder="问题" @change="master!.factProfile.qaNotes[i]!.question = ($event.target as HTMLInputElement).value" />
            <input :value="qa.answer" class="input" placeholder="答案" @change="master!.factProfile.qaNotes[i]!.answer = ($event.target as HTMLInputElement).value" />
            <button class="btn btn-danger !px-2" @click="master!.factProfile.qaNotes.splice(i, 1)">×</button>
          </div>
          <button class="btn btn-outline w-full" @click="master!.factProfile.qaNotes.push({ question: '', answer: '' })">+ 添加问答</button>
        </div>
        <button class="btn btn-primary w-full" @click="updateFact('updatedAt', Date.now())">保存事实库</button>
      </div>
    </template>
  </div>
</template>
