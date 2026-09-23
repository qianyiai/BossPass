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

/**
 * 宽松字符串数组：模型经常返回 [{skill:"X",evidence:"..."}] 而不是 ["X｜..."],
 * 统一拍平成字符串（主值｜依据）；字符串数组/换行分隔字符串也兼容。
 */
const FlexibleStringArray = z.preprocess((v) => {
  const flatten = (item: unknown): string => {
    if (typeof item === 'string') return item.trim()
    if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>
      const pickStr = (keys: string[]): string => {
        for (const k of keys) {
          const x = o[k]
          if (typeof x === 'string' && x.trim()) return x.trim()
        }
        return ''
      }
      const main = pickStr(['skill', 'name', 'label', 'point', 'title', 'text', 'issue', 'risk', 'question', 'content', 'item', 'desc', 'description', '建议', '技能', '问题', '风险'])
      const extra = pickStr(['evidence', 'reason', 'detail', 'why', '依据', '原因', '说明'])
      if (main) return extra ? `${main}｜${extra}` : main
      const first = Object.values(o).find((x) => typeof x === 'string' && x.trim())
      return typeof first === 'string' ? first.trim() : JSON.stringify(o)
    }
    return String(item ?? '')
  }
  if (typeof v === 'string') {
    return v
      .split(/[\n;；]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  if (!Array.isArray(v)) return []
  return v.map(flatten).filter(Boolean)
}, z.array(z.string()).default([]))

/** matchScore 兼容 "82" / 82 等形态 */
const TolerantScore = z.preprocess((v) => {
  if (typeof v === 'string') {
    const n = Number(v.replace(/[^\d.]/g, ''))
    if (Number.isNaN(n)) return 0
    return n
  }
  return v
}, z.number().min(0).max(100).default(0))

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
  matchScore: TolerantScore,
  scoreAfterOptimize: z.number().min(0).max(100).nullable().default(null),
  matchedSkills: FlexibleStringArray,
  missingSkills: FlexibleStringArray,
  strongPoints: FlexibleStringArray,
  weakPoints: FlexibleStringArray,
  resumeIssues: FlexibleStringArray,
  jobRisks: FlexibleStringArray,
  recommendations: FlexibleStringArray,
  /** 反编造检查：AI 声称要用但事实库缺失的能力 */
  fabricationChecks: z
    .array(
      z.preprocess((v) => {
        if (!v || typeof v !== 'object') return v
        const o = v as Record<string, unknown>
        const status = typeof o.status === 'string' ? o.status.toLowerCase() : 'missing'
        return {
          skill: typeof o.skill === 'string' ? o.skill : String(o.skill ?? ''),
          status: status === 'verified' ? 'verified' : 'missing',
          question: typeof o.question === 'string' ? o.question : '',
        }
      }, z.object({
        skill: z.string(),
        status: z.enum(['verified', 'missing']).default('missing'),
        question: z.string().default(''),
      })),
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
