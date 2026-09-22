<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { STATUS_LABEL, STATUS_ORDER, type Application, type ApplicationStatus } from '@/applications/schema/application'
import { listApplications, deleteApplication } from '@/storage/db'
import { randomId } from '@/utils/logger'

const apps = ref<Application[]>([])
const filter = ref<'active' | 'all'>('active')

const ACTIVE_STATUSES: ApplicationStatus[] = [
  'Viewed',
  'Analyzed',
  'ResumeOptimized',
  'GreetingGenerated',
  'Contacted',
  'Applied',
  'HRReplied',
  'Interview',
]

const visible = computed(() =>
  filter.value === 'all' ? apps.value : apps.value.filter((a) => ACTIVE_STATUSES.includes(a.status)),
)

async function refresh() {
  apps.value = (await listApplications()).sort((a, b) => b.updatedAt - a.updatedAt)
}

async function setStatus(a: Application, status: ApplicationStatus) {
  a.status = status
  a.updatedAt = Date.now()
  await import('@/storage/db').then((db) => db.upsertApplication(a))
  await refresh()
}

async function addNote(a: Application, content: string) {
  if (!content.trim()) return
  a.notes.push({ id: randomId('note'), content: content.trim(), time: Date.now() })
  await import('@/storage/db').then((db) => db.upsertApplication(a))
  await refresh()
}

const noteInput = ref<Record<string, string>>({})

function statusBadge(status: ApplicationStatus): string {
  if (status === 'Offer') return 'badge bg-green-50 text-green-700'
  if (status === 'Rejected' || status === 'Withdrawn') return 'badge bg-red-50 text-red-600'
  if (status === 'Interview' || status === 'HRReplied') return 'badge bg-blue-50 text-blue-700'
  return 'badge bg-gray-100 text-gray-600'
}

function nextStatuses(current: ApplicationStatus): ApplicationStatus[] {
  const flow: ApplicationStatus[] = ['Contacted', 'Applied', 'HRReplied', 'Interview', 'Offer', 'Rejected', 'Withdrawn']
  return flow.filter((s) => s !== current)
}

onMounted(() => void refresh())
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between px-1">
      <span class="text-xs font-semibold">申请跟踪（{{ visible.length }}）</span>
      <div class="flex gap-1">
        <button class="btn !py-1" :class="filter === 'active' ? 'btn-primary' : 'btn-outline'" @click="filter = 'active'">进行中</button>
        <button class="btn !py-1" :class="filter === 'all' ? 'btn-primary' : 'btn-outline'" @click="filter = 'all'">全部</button>
        <button class="btn btn-outline !py-1" @click="refresh">刷新</button>
      </div>
    </div>

    <div v-for="a in visible" :key="a.id" class="card space-y-1.5">
      <div class="flex items-start justify-between gap-2">
        <div>
          <div class="text-xs font-semibold">{{ a.jobTitle }}</div>
          <div class="text-[11px] text-gray-500">{{ a.company }} · {{ a.hrName || 'HR未知' }}</div>
        </div>
        <span :class="statusBadge(a.status)">{{ STATUS_LABEL[a.status] }}</span>
      </div>

      <div class="flex flex-wrap items-center gap-1 text-[10px] text-gray-400">
        <span v-if="a.matchScore >= 0" class="badge bg-blue-50 text-blue-600">匹配 {{ a.matchScore }}%</span>
        <span v-if="a.resumeVersionId" class="badge bg-green-50 text-green-700">定制简历</span>
        <span>{{ new Date(a.updatedAt).toLocaleDateString() }}</span>
        <a v-if="a.jobUrl" :href="a.jobUrl" target="_blank" class="text-blue-500 hover:underline">打开岗位</a>
        <button class="text-red-400 hover:underline" @click="deleteApplication(a.id).then(refresh)">删除</button>
      </div>

      <!-- 状态推进 -->
      <select class="input !py-1 text-[11px]" :value="a.status" @change="setStatus(a, ($event.target as HTMLSelectElement).value as ApplicationStatus)">
        <option v-for="s in STATUS_ORDER" :key="s" :value="s">{{ STATUS_LABEL[s] }}</option>
      </select>

      <!-- 笔记 -->
      <div v-if="a.notes.length" class="space-y-0.5">
        <div v-for="n in a.notes" :key="n.id" class="rounded bg-gray-50 px-1.5 py-1 text-[11px] text-gray-600">
          {{ n.content }} <span class="text-gray-300">{{ new Date(n.time).toLocaleDateString() }}</span>
        </div>
      </div>
      <div class="flex gap-1">
        <input class="input" placeholder="添加笔记（面试反馈等）" @keydown.enter="addNote(a, noteInput[a.id] ?? ''); noteInput[a.id] = ''" v-model="noteInput[a.id]" />
        <button class="btn btn-outline !px-2" @click="addNote(a, noteInput[a.id] ?? '')">+</button>
      </div>
    </div>

    <div v-if="!visible.length" class="card text-center text-[11px] text-gray-400">暂无记录。打开 BOSS 岗位页即可自动创建。</div>
  </div>
</template>
