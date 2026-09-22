import { z } from 'zod'

export type { ResumeChange } from '@/resume/schema/resume'

export const ApplicationStatus = z.enum([
  'Viewed',
  'Analyzed',
  'ResumeOptimized',
  'GreetingGenerated',
  'Contacted',
  'Applied',
  'HRReplied',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
])
export type ApplicationStatus = z.infer<typeof ApplicationStatus>

export const STATUS_ORDER: ApplicationStatus[] = [
  'Viewed',
  'Analyzed',
  'ResumeOptimized',
  'GreetingGenerated',
  'Contacted',
  'Applied',
  'HRReplied',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
]

export const STATUS_LABEL: Record<ApplicationStatus, string> = {
  Viewed: '已查看',
  Analyzed: '已分析',
  ResumeOptimized: '已优化简历',
  GreetingGenerated: '已生成招呼',
  Contacted: '已联系 HR',
  Applied: '已投递',
  HRReplied: 'HR 已回复',
  Interview: '面试',
  Offer: 'Offer',
  Rejected: '已拒绝',
  Withdrawn: '已撤回',
}

export const ChatMessageSchema = z.object({
  id: z.string(),
  role: z.enum(['me', 'hr', 'system']),
  content: z.string(),
  time: z.number().default(0),
})
export type ChatMessage = z.infer<typeof ChatMessageSchema>

export const ApplicationSchema = z.object({
  id: z.string(),
  jobKey: z.string(),
  platform: z.string().default('boss'),
  company: z.string().default(''),
  jobTitle: z.string().default(''),
  jobUrl: z.string().default(''),
  jobDescriptionSnapshot: z.string().default(''),
  jobId: z.string().default(''),
  hrName: z.string().default(''),
  resumeVersionId: z.string().default(''),
  matchScore: z.number().default(-1),
  matchAnalysis: z.unknown().nullable().default(null),
  status: ApplicationStatus.default('Viewed'),
  createdAt: z.number(),
  updatedAt: z.number(),
  messages: z.array(ChatMessageSchema).default([]),
  notes: z
    .array(z.object({ id: z.string(), content: z.string(), time: z.number() }))
    .default([]),
  greeting: z.string().default(''),
})
export type Application = z.infer<typeof ApplicationSchema>

export const MatchAnalysisSchema = z.object({
  matchScore: z.number().min(0).max(100),
  scoreAfterOptimize: z.number().min(0).max(100).nullable().default(null),
  matchedSkills: z.array(z.string()).default([]),
  missingSkills: z.array(z.string()).default([]),
  strongPoints: z.array(z.string()).default([]),
  weakPoints: z.array(z.string()).default([]),
  resumeIssues: z.array(z.string()).default([]),
  jobRisks: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  /** 反编造检查：AI 声称要用但事实库缺失的能力 */
  fabricationChecks: z
    .array(
      z.object({
        skill: z.string(),
        status: z.enum(['verified', 'missing']),
        question: z.string().default(''),
      }),
    )
    .default([]),
  summary: z.string().default(''),
})
export type MatchAnalysis = z.infer<typeof MatchAnalysisSchema>

export const JobRiskSchema = z.object({
  label: z.string(),
  evidence: z.string().default(''),
  level: z.enum(['info', 'warning', 'danger']).default('info'),
})
export type JobRisk = z.infer<typeof JobRiskSchema>
