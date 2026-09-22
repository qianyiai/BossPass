<script setup lang="ts">
import type { MatchAnalysis } from '@/applications/schema/application'

const props = defineProps<{ analysis: MatchAnalysis; scoreAfter?: number | null }>()

function scoreColor(score: number): string {
  if (score >= 80) return 'text-green-600'
  if (score >= 60) return 'text-blue-600'
  if (score >= 40) return 'text-amber-600'
  return 'text-red-500'
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center gap-4">
      <div class="flex flex-col items-center">
        <div class="text-3xl font-bold" :class="scoreColor(props.analysis.matchScore)">
          {{ props.analysis.matchScore }}%
        </div>
        <div class="text-[11px] text-gray-500">匹配度</div>
      </div>
      <div v-if="props.scoreAfter != null" class="flex items-center gap-1 text-sm">
        <span class="text-gray-400">→</span>
        <span class="text-xl font-bold text-green-600">{{ props.scoreAfter }}%</span>
        <span class="text-[11px] text-gray-500">优化后</span>
      </div>
      <div v-if="props.analysis.summary" class="flex-1 text-[11px] leading-relaxed text-gray-600">
        {{ props.analysis.summary }}
      </div>
    </div>

    <div class="grid grid-cols-1 gap-2">
      <div v-if="props.analysis.matchedSkills.length">
        <div class="label !mb-0.5">✓ 匹配技能</div>
        <div class="flex flex-wrap gap-1">
          <span v-for="s in props.analysis.matchedSkills" :key="s" class="badge bg-green-50 text-green-700">{{ s }}</span>
        </div>
      </div>
      <div v-if="props.analysis.missingSkills.length">
        <div class="label !mb-0.5">△ 缺失能力</div>
        <div class="flex flex-wrap gap-1">
          <span v-for="s in props.analysis.missingSkills" :key="s" class="badge bg-amber-50 text-amber-700">{{ s }}</span>
        </div>
      </div>
      <div v-if="props.analysis.strongPoints.length">
        <div class="label !mb-0.5">优势</div>
        <ul class="list-inside list-disc space-y-0.5 text-[11px] text-gray-700">
          <li v-for="p in props.analysis.strongPoints" :key="p">{{ p }}</li>
        </ul>
      </div>
      <div v-if="props.analysis.weakPoints.length">
        <div class="label !mb-0.5">短板</div>
        <ul class="list-inside list-disc space-y-0.5 text-[11px] text-gray-700">
          <li v-for="p in props.analysis.weakPoints" :key="p">{{ p }}</li>
        </ul>
      </div>
      <div v-if="props.analysis.resumeIssues.length">
        <div class="label !mb-0.5">简历问题</div>
        <ul class="list-inside list-disc space-y-0.5 text-[11px] text-gray-700">
          <li v-for="p in props.analysis.resumeIssues" :key="p">{{ p }}</li>
        </ul>
      </div>
      <div v-if="props.analysis.recommendations.length">
        <div class="label !mb-0.5">建议</div>
        <ul class="list-inside list-disc space-y-0.5 text-[11px] text-gray-700">
          <li v-for="p in props.analysis.recommendations" :key="p">{{ p }}</li>
        </ul>
      </div>
    </div>
  </div>
</template>
