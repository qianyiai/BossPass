import { z } from 'zod'

/**
 * 标准 Resume Schema（Master Resume 与所有岗位版本共用）。
 * AI 生成/优化简历时输出同一结构，不允许出现资料之外的经历。
 */
export const ResumeExperience = z.object({
  company: z.string().default(''),
  title: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  location: z.string().default(''),
  bullets: z.array(z.string()).default([]),
})
export type ResumeExperience = z.infer<typeof ResumeExperience>

export const ResumeProject = z.object({
  name: z.string().default(''),
  role: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
  url: z.string().default(''),
  bullets: z.array(z.string()).default([]),
})
export type ResumeProject = z.infer<typeof ResumeProject>

export const ResumeEducation = z.object({
  school: z.string().default(''),
  degree: z.string().default(''),
  major: z.string().default(''),
  startDate: z.string().default(''),
  endDate: z.string().default(''),
})
export type ResumeEducation = z.infer<typeof ResumeEducation>

export const ResumeSchema = z.object({
  profile: z.object({
    name: z.string().default(''),
    email: z.string().default(''),
    phone: z.string().default(''),
    location: z.string().default(''),
    linkedin: z.string().default(''),
    website: z.string().default(''),
  }),
  summary: z.string().default(''),
  skills: z.array(z.string()).default([]),
  experience: z.array(ResumeExperience).default([]),
  projects: z.array(ResumeProject).default([]),
  education: z.array(ResumeEducation).default([]),
  certifications: z.array(z.string()).default([]),
  languages: z.array(z.string()).default([]),
})
export type Resume = z.infer<typeof ResumeSchema>

/**
 * User Fact Profile —— 用户事实库，AI 的事实基础。
 * AI 不允许添加此库之外的经历；缺失能力的补充也必须先写入这里。
 */
export const UserFactProfileSchema = z.object({
  skills: z.array(z.string()).default([]),
  techStack: z.array(z.string()).default([]),
  yearsOfExperience: z.string().default(''),
  workRights: z.string().default(''),
  visas: z.string().default(''),
  location: z.string().default(''),
  availableFrom: z.string().default(''),
  expectedSalary: z.string().default(''),
  currentSalary: z.string().default(''),
  preferences: z.array(z.string()).default([]),
  /** 常见 HR 问题的既定答案 */
  qaNotes: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .default([]),
  updatedAt: z.number().default(0),
})
export type UserFactProfile = z.infer<typeof UserFactProfileSchema>

/** Master Resume + 事实库整体 */
export const MasterResumeSchema = z.object({
  id: z.string(),
  resume: ResumeSchema,
  factProfile: UserFactProfileSchema,
  createdAt: z.number(),
  updatedAt: z.number(),
})
export type MasterResume = z.infer<typeof MasterResumeSchema>

/** 岗位定制版本 */
export const ResumeVersionSchema = z.object({
  id: z.string(),
  masterId: z.string(),
  jobKey: z.string().default(''),
  jobId: z.string().default(''),
  jobTitle: z.string().default(''),
  company: z.string().default(''),
  matchScore: z.number().default(-1),
  resume: ResumeSchema,
  /** 生成时依据的 JD 摘要 */
  jobDescriptionSnapshot: z.string().default(''),
  createdAt: z.number(),
})
export type ResumeVersion = z.infer<typeof ResumeVersionSchema>

/** AI 提出的一处简历修改 */
export const ResumeChange = z.object({
  path: z.string(),
  label: z.string(),
  before: z.string().default(''),
  after: z.string().default(''),
  reason: z.string().default(''),
  status: z.enum(['pending', 'accepted', 'rejected']).default('pending'),
})
export type ResumeChange = z.infer<typeof ResumeChange>
