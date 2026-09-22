<script setup lang="ts">
import { ref } from 'vue'
import {
  chatMessages,
  chatReplies,
  missingInfo,
  loadingChat,
  generatingReplies,
  loadChat,
  runGenerateReplies,
  sendReply,
  master,
} from '../useAppState'

const manualHR = ref('')
const reply = ref('')
const sentTip = ref('')

const styleLabel: Record<string, string> = { concise: '简洁', natural: '自然', detailed: '详细' }

async function onSend(content: string, mode: 'fill' | 'confirm-send') {
  sentTip.value = ''
  try {
    const res = await sendReply(content, mode)
    sentTip.value = res.message ?? '已操作'
  } catch (e) {
    sentTip.value = e instanceof Error ? e.message : String(e)
  }
}

async function addManual() {
  if (!manualHR.value.trim()) return
  chatMessages.value.push({ role: 'hr', content: manualHR.value.trim() })
  manualHR.value = ''
}

function copyReply(content: string) {
  void navigator.clipboard?.writeText(content)
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex gap-2">
      <button class="btn btn-outline flex-1" :disabled="loadingChat" @click="loadChat">
        {{ loadingChat ? '读取中…' : '读取聊天记录' }}
      </button>
    </div>

    <!-- 手动粘贴 HR 消息 -->
    <div class="card">
      <div class="label">HR 消息（DOM 读取失败时手动粘贴）</div>
      <textarea v-model="manualHR" rows="2" class="input" placeholder="粘贴 HR 最新消息…"></textarea>
      <button class="btn btn-outline mt-1 w-full" @click="addManual">添加到聊天</button>
    </div>

    <!-- 聊天记录 -->
    <div v-if="chatMessages.length" class="card max-h-48 space-y-1 overflow-auto">
      <div v-for="(m, i) in chatMessages" :key="i" class="flex" :class="m.role === 'me' ? 'justify-end' : 'justify-start'">
        <span class="max-w-[85%] rounded-lg px-2 py-1 text-[11px]" :class="m.role === 'me' ? 'bg-blue-50 text-blue-900' : 'bg-gray-100 text-gray-800'">
          {{ m.content }}
        </span>
      </div>
    </div>

    <button class="btn btn-primary w-full" :disabled="generatingReplies || !master" @click="runGenerateReplies">
      <span v-if="generatingReplies">生成回复建议…</span>
      <span v-else>生成回复建议（3 条）</span>
    </button>

    <!-- 反编造提示 -->
    <div v-if="missingInfo.length" class="card border-amber-200 bg-amber-50 text-[11px] text-amber-800">
      <b>资料中未发现：</b>{{ missingInfo.join('、') }}。AI 不会假装你有相关经验；可在「简历」页补充真实经历后重新生成。
    </div>

    <!-- 回复建议 -->
    <div v-if="chatReplies.length" class="space-y-2">
      <div v-for="(r, i) in chatReplies" :key="i" class="card space-y-1.5">
        <div class="flex items-center justify-between">
          <span class="badge bg-blue-50 text-blue-700">{{ styleLabel[r.style] ?? r.style }}</span>
          <span v-if="!r.grounded" class="badge bg-amber-50 text-amber-700">含不保证项，注意核实</span>
        </div>
        <textarea v-model="r.content" rows="3" class="input"></textarea>
        <div v-if="r.note" class="text-[11px] text-gray-500">{{ r.note }}</div>
        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" @click="onSend(r.content, 'fill')">插入输入框</button>
          <button class="btn btn-outline flex-1" @click="onSend(r.content, 'confirm-send')">插入并发送</button>
          <button class="btn btn-outline" @click="copyReply(r.content)">复制</button>
        </div>
      </div>
      <div v-if="sentTip" class="text-[11px] text-blue-600">{{ sentTip }}</div>
    </div>
  </div>
</template>
