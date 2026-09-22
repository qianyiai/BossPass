import { z } from 'zod'
import type { Job } from '@/jobs/schema/job'
import type { MatchAnalysis, ResumeChange } from '@/applications/schema/application'
import type { Resume, UserFactProfile } from '@/resume/schema/resume'
import { ResumeSchema } from '@/resume/schema/resume'

export const OptimizeResumeOutputSchema = z.object({
  optimizedResume: ResumeSchema,
  changes: z
    .array(
      z.object({
        path: z.string(),
        label: z.string(),
        before: z.string().default(''),
        after: z.string().default(''),
        reason: z.string().default(''),
      }),
    )
    .default([]),
  scoreAfterOptimize: z.number().min(0).max(100).nullable().default(null),
  gaps: z
    .array(
      z.object({
        skill: z.string(),
        question: z.string(),
      }),
    )
    .default([]),
})
export type OptimizeResumeOutput = z.infer<typeof OptimizeResumeOutputSchema>
export type { ResumeChange }

const SYSTEM = `你是简历优化引擎。基于职位 + 当前简历 + 事实库，输出针对该岗位的优化版简历。

【铁律——禁止编造】
1. 只允许基于「事实库」与「原简历」中真实存在的信息重新表达，不得新增任何经历、项目、数字、技能。
2. JD 要求某能力但事实库没有时：绝不写入简历，放入 gaps 数组（skill + 追问 question）。
3. 数字/规模/时长只能使用原简历中已有的，不得夸大。

【允许的优化】
- summary 针对岗位重写（突出相关经历与方向）
- bullets 重新表达：动词开头、突出成果、嵌入 JD 关键词（必须是真实做过的）
- skills 排序调整：岗位相关技能靠前；只保留事实库中存在的
- projects/experience 排序：最相关的靠前
- 删除与岗位无关且冗长的内容（压缩，不是删除经历本身）
- 修正错别字与格式

【changes 要求】
每一处修改生成一条：path（如 "experience[0].bullets[1]"）、label（人类可读位置名）、before（原文）、after（改后）、reason（为什么这样改，引用 JD 需求）。before/after 必须是真实的原文与改后文本。`

export function buildOptimizeResumePrompt(input: {
  job: Job
  resume: Resume
  factProfile: UserFactProfile
  matchAnalysis?: MatchAnalysis | null
}): { system: string; user: string } {
  const { job, resume, factProfile, matchAnalysis } = input
  const user = `<职位>
标题：${job.title}
公司：${job.company.name}
技能标签：${job.skills.join('、')}
JD：
${job.description || '（无）'}
</职位>

${matchAnalysis ? `<匹配分析（参考）\n${JSON.stringify(matchAnalysis, null, 1)}\n</匹配分析>` : ''}

<当前简历>
${JSON.stringify(resume, null, 1)}
</当前简历>

<事实库（唯一事实来源，禁止超出）>
${JSON.stringify(factProfile, null, 1)}
</事实库>`
  return { system: SYSTEM, user }
}

// ---------- 单段经历重写（补充真实细节后调用） ----------

const REWRITE_SYSTEM = `你是简历 bullet 重写器。给定一段原始经历和用户补充的真实细节，输出 2-4 条重写后的 bullet。
规则：动词开头、量化成果（只能使用提供的数字）、嵌入指定关键词；禁止编造未提供的事实。`

export function buildRewriteExperiencePrompt(input: {
  originalBullets: string[]
  extraFacts: string
  keywords: string[]
}): { system: string; user: string } {
  const user = `原始经历：
${input.originalBullets.map((b) => `- ${b}`).join('\n') || '（无）'}

用户补充的真实细节：
${input.extraFacts || '（无）'}

需要自然嵌入的关键词：${input.keywords.join('、') || '无'}`
  return { system: REWRITE_SYSTEM, user }
}

export const RewriteBulletsSchema = z.object({ bullets: z.array(z.string()) })

// ---------- Summary 单独优化 ----------

const SUMMARY_SYSTEM = `重写简历 Summary：2-3 句话，针对给定岗位，突出相关年限/方向/代表性成果。只用事实库中存在的信息，禁止编造。`

export function buildOptimizeSummaryPrompt(input: {
  job: Job
  summary: string
  factProfile: UserFactProfile
}): { system: string; user: string } {
  const user = `目标岗位：${input.job.title}（${input.job.company.name}）
技能标签：${input.job.skills.join('、')}

当前 Summary：
${input.summary || '（空）'}

事实库：${JSON.stringify(input.factProfile)}`
  return { system: SUMMARY_SYSTEM, user }
}

export const SummarySchema = z.object({ summary: z.string() })
