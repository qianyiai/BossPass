import { z } from 'zod'

/**
 * 统一 Job Schema —— 所有平台的岗位数据都转换为这个结构。
 * 核心引擎（分析/简历/打招呼）只依赖这里，不依赖任何平台。
 */
export const Platform = z.enum(['boss', 'linkedin', 'indeed', 'seek', 'liepin', 'zhaopin', '51job', 'careers'])
export type Platform = z.infer<typeof Platform>

export const HRInfo = z.object({
  name: z.string().default(''),
  title: z.string().default(''),
  /** 平台内部 HR 标识（如 boss 的 encryptBossId），用于消息发送 */
  platformUserId: z.string().default(''),
  /** 平台内部数字 id（boss 的 bossId），部分发送通道需要 */
  platformUid: z.string().default(''),
  online: z.boolean().default(false),
  activeDesc: z.string().default(''),
})
export type HRInfo = z.infer<typeof HRInfo>

export const CompanyInfo = z.object({
  name: z.string().default(''),
  logo: z.string().default(''),
  industry: z.string().default(''),
  scale: z.string().default(''),
  stage: z.string().default(''),
  introduce: z.string().default(''),
  /** 平台内部公司标识 */
  platformCompanyId: z.string().default(''),
})
export type CompanyInfo = z.infer<typeof CompanyInfo>

export const JobSchema = z.object({
  platform: Platform,
  /** 平台唯一岗位 id（boss: encryptJobId） */
  jobId: z.string(),
  /** boss::encryptJobId 形式的全局 key */
  key: z.string(),
  url: z.string().default(''),
  title: z.string().default(''),
  company: CompanyInfo.default({
    name: '',
    logo: '',
    industry: '',
    scale: '',
    stage: '',
    introduce: '',
    platformCompanyId: '',
  }),
  description: z.string().default(''),
  responsibilities: z.array(z.string()).default([]),
  requirements: z.array(z.string()).default([]),
  skills: z.array(z.string()).default([]),
  experienceRequirement: z.string().default(''),
  educationRequirement: z.string().default(''),
  salary: z.string().default(''),
  location: z.string().default(''),
  benefits: z.array(z.string()).default([]),
  labels: z.array(z.string()).default([]),
  hr: HRInfo.default({
    name: '',
    title: '',
    platformUserId: '',
    platformUid: '',
    online: false,
    activeDesc: '',
  }),
  /** 求职者是否已与对方沟通过（平台状态） */
  contacted: z.boolean().default(false),
  /** 抓取时间 */
  fetchedAt: z.number().default(0),
})
export type Job = z.infer<typeof JobSchema>

/** 从岗位描述文本里粗切职责/要求段落的工具（由 AI 分析兜底精细化） */
export function splitDescriptionBlocks(description: string): { responsibilities: string[]; requirements: string[] } {
  const responsibilities: string[] = []
  const requirements: string[] = []
  let bucket: 'none' | 'resp' | 'req' = 'none'
  const respHints = ['岗位职责', '工作职责', '职责描述', '你将', '工作内容', 'responsibilities', 'what you']
  const reqHints = ['任职要求', '岗位要求', '任职资格', '职位要求', '要求', ' qualifications', 'requirements', 'we expect']
  for (const rawLine of description.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const lower = line.toLowerCase()
    if (reqHints.some((h) => lower.includes(h)) && line.length < 30) { bucket = 'req'; continue }
    if (respHints.some((h) => lower.includes(h)) && line.length < 30) { bucket = 'resp'; continue }
    if (bucket === 'resp') responsibilities.push(line.replace(/^[-•·*\d.、\s]+/, ''))
    else if (bucket === 'req') requirements.push(line.replace(/^[-•·*\d.、\s]+/, ''))
  }
  return { responsibilities, requirements }
}
