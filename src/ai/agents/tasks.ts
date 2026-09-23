import { runStructured, runText, resolveModel, parseJsonLoose } from '@/ai/agents'
import { generateText } from 'ai'
import { z } from 'zod'
import {
  AnalyzeOutputSchema,
  buildAnalyzeJobPrompt,
  buildMatchResumePrompt,
  mergeAnalysis,
  type JobUnderstanding,
} from '@/ai/prompts/analyze-job'
import {
  OptimizeResumeOutputSchema,
  buildOptimizeResumePrompt,
  RewriteBulletsSchema,
  SummarySchema,
  buildOptimizeSummaryPrompt,
  buildRewriteExperiencePrompt,
} from '@/ai/prompts/optimize-resume'
import { GreetingOutputSchema, buildGreetingPrompt } from '@/ai/prompts/generate-greeting'
import {
  ChatReplyOutputSchema,
  FollowupOutputSchema,
  buildChatReplyPrompt,
  buildFollowupPrompt,
} from '@/ai/prompts/generate-chat-reply'
import { buildParseResumePrompt, normalizeParsedResume } from '@/ai/prompts/parse-resume'
import type { MatchAnalysis } from '@/applications/schema/application'
import type { Job } from '@/jobs/schema/job'
import type { Resume, UserFactProfile } from '@/resume/schema/resume'
import type { GreetingStyle } from '@/storage/settings'

/** 岗位理解 + 匹配分析（一次调用） */
export async function analyzeJobAndMatch(input: {
  job: Job
  resume: Resume
  factProfile: UserFactProfile
}): Promise<{ analysis: MatchAnalysis; understanding: JobUnderstanding }> {
  const prompt = buildMatchResumePrompt(input)
  const output = await runStructured('analyze', AnalyzeOutputSchema, prompt)
  return mergeAnalysis(output)
}

/** 岗位结构化理解（仅 JD） */
export async function understandJob(job: Job): Promise<JobUnderstanding> {
  const p = buildAnalyzeJobPrompt(job)
  const { understanding } = { understanding: await runStructured('analyze', (await import('@/ai/prompts/analyze-job')).JobUnderstandingSchema, p) }
  return understanding
}

/** 针对岗位优化简历，输出变更列表 + 优化后完整简历 */
export async function optimizeResumeForJob(input: {
  job: Job
  resume: Resume
  factProfile: UserFactProfile
  matchAnalysis?: MatchAnalysis | null
}) {
  const prompt = buildOptimizeResumePrompt(input)
  return runStructured('resume', OptimizeResumeOutputSchema, prompt)
}

/** 生成打招呼文案 */
export async function generateGreeting(input: {
  job: Job
  resume: Resume
  factProfile: UserFactProfile
  matchAnalysis?: MatchAnalysis | null
  style: GreetingStyle
}) {
  const { job, resume, factProfile, matchAnalysis, style } = input
  const jdSummary = (job.description || '').slice(0, 1500) || job.skills.join('、')
  const resumeSummary = [
    resume.summary,
    ...resume.experience.map((e) => `${e.title}@${e.company}: ${e.bullets.slice(0, 2).join('；')}`),
    ...resume.projects.map((p) => `${p.name}: ${p.bullets.slice(0, 2).join('；')}`),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 2000)

  // 突出事实：优先用匹配分析里的 strongPoints / matchedSkills 对应的真实经历
  const highlightFacts = [
    ...(matchAnalysis?.strongPoints ?? []).slice(0, 3),
    ...factProfile.skills.slice(0, 5),
    ...factProfile.qaNotes.slice(0, 2).map((q) => `${q.question}: ${q.answer}`),
  ]

  const prompt = buildGreetingPrompt({
    jobTitle: job.title,
    company: job.company.name,
    hrName: job.hr.name,
    hrTitle: job.hr.title,
    jobSkills: job.skills,
    jdSummary,
    resumeSummary,
    highlightFacts,
    style,
  })
  return runStructured('greeting', GreetingOutputSchema, prompt)
}

/** 聊天回复建议（≤3 条） */
export async function generateChatReplies(input: {
  jobTitle: string
  companyName: string
  chatHistory: Array<{ role: 'me' | 'hr'; content: string }>
  latestHRMessage: string
  resume: Resume
  factProfile: UserFactProfile
}) {
  const resumeSummary = [
    input.resume.summary,
    ...input.resume.experience.map((e) => `${e.title}@${e.company}`),
  ]
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500)
  const prompt = buildChatReplyPrompt({
    ...input,
    resumeSummary,
    factProfileJSON: JSON.stringify(input.factProfile),
  })
  return runStructured('chat', ChatReplyOutputSchema, prompt)
}

/** 跟进消息 */
export async function generateFollowup(input: {
  job: Job
  chatHistory: Array<{ role: 'me' | 'hr'; content: string }>
  lastMyMessage: string
  factProfile: UserFactProfile
}) {
  const prompt = buildFollowupPrompt({
    jobTitle: input.job.title,
    hrName: input.job.hr.name,
    lastMyMessage: input.lastMyMessage,
    chatHistory: input.chatHistory,
    highlightFacts: [...input.factProfile.skills.slice(0, 5)],
  })
  return runStructured('chat', FollowupOutputSchema, prompt)
}

/** PDF 文本 → 结构化简历：大嵌套 schema 的结构化输出在部分兼容端点不稳定，
 * 统一走纯文本生成 + 键名归一化（模型返回中文/别名键也能映射回标准结构） */
export async function parseResumeText(resumeText: string): Promise<Resume> {
  const prompt = buildParseResumePrompt(resumeText)
  const { model, provider } = await resolveModel('parse')
  const { text } = await generateText({
    model,
    system: prompt.system,
    prompt: prompt.user,
    temperature: provider.temperature,
    maxOutputTokens: 8000,
    abortSignal: AbortSignal.timeout(provider.timeoutMs),
  })
  const raw = parseJsonLoose(text, z.unknown())
  return normalizeParsedResume(raw)
}

/** 重写某段经历 bullets（用户补充真实细节后） */
export async function rewriteExperienceBullets(input: {
  originalBullets: string[]
  extraFacts: string
  keywords: string[]
}): Promise<string[]> {
  const prompt = buildRewriteExperiencePrompt(input)
  const out = await runStructured('resume', RewriteBulletsSchema, prompt)
  return out.bullets
}

/** 单独优化 Summary */
export async function optimizeSummary(input: {
  job: Job
  summary: string
  factProfile: UserFactProfile
}): Promise<string> {
  const prompt = buildOptimizeSummaryPrompt(input)
  const out = await runStructured('resume', SummarySchema, prompt)
  return out.summary
}

export { runText }
