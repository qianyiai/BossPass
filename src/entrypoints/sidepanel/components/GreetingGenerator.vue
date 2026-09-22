<script setup lang="ts">
import { computed } from 'vue'
import {
  greeting,
  greetingNotes,
  generatingGreeting,
  sendingGreeting,
  greetingResult,
  runGenerateGreeting,
  sendGreetingText,
  job,
  settings,
} from '../useAppState'

const toneLabel = computed(() => {
  const t = settings.value?.greeting.tone
  return { natural: '自然', concise: '简洁', professional: '专业', proactive: '主动', tech: '技术型', product: '产品型' }[t ?? 'natural']
})
</script>

<template>
  <div class="space-y-3">
    <div v-if="!job" class="card text-xs text-gray-500">请先在「岗位」页识别到 BOSS 岗位。</div>
    <template v-else>
      <button class="btn btn-primary w-full" :disabled="generatingGreeting" @click="runGenerateGreeting">
        <span v-if="generatingGreeting">生成中…</span>
        <span v-else>生成打招呼（{{ toneLabel }}风格）</span>
      </button>

      <div v-if="greeting || greetingNotes.length" class="card space-y-2">
        <div class="label !mb-0">打招呼内容（可编辑）</div>
        <textarea v-model="greeting" rows="5" class="input"></textarea>
        <div v-if="greetingNotes.length" class="text-[11px] text-gray-500">
          <div v-for="(n, i) in greetingNotes" :key="i">· {{ n }}</div>
        </div>
        <div class="text-[11px] text-gray-400">{{ greeting.length }} 字</div>

        <div class="flex gap-2">
          <button class="btn btn-primary flex-1" :disabled="sendingGreeting || !greeting.trim()" @click="sendGreetingText('fill')">
            填入聊天框
          </button>
          <button class="btn btn-outline flex-1" :disabled="sendingGreeting || !greeting.trim()" @click="sendGreetingText('confirm-send')">
            填入并发送
          </button>
          <button class="btn btn-outline" @click="runGenerateGreeting" :disabled="generatingGreeting">重新生成</button>
        </div>
        <div v-if="greetingResult" class="text-[11px] text-blue-600">{{ greetingResult }}</div>
        <p class="text-[10px] leading-relaxed text-gray-400">
          所有消息都需要你确认后才会发出；「填入聊天框」会把文本写入 BOSS 聊天输入框，由你点击发送。
        </p>
      </div>
    </template>
  </div>
</template>
