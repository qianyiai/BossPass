import { z } from 'zod'
import type { Job } from '@/jobs/schema/job'
import type { MatchAnalysis } from '@/applications/schema/application'
import type { Resume, UserFactProfile } from '@/resume/schema/resume'
import { MatchAnalysisSchema } from '@/applications/schema/application'

/**
 * 岗位分析：从 JD 提取结构化信息。
 */
export const JobUnderstandingSchema = z.object({
  coreResponsibilities: z.array(z.string()).default([]),
  hardRequirements: z.array(z.string()).default([]),
  keySkills: z.array(z.string()).default([]),
  teamAndRoleContext: z.string().default(''),
  redFlags: z.array(z.string()).default([]),
})
export type JobUnderstanding = z.infer<typeof JobUnderstandingSchema>

const SYSTEM = `你是资深技术招聘顾问。从职位描述中提取结构化信息。
- 只依据给定 JD，不要脑补。
- redFlags 识别风险信号：销售性质/电销/外勤、高提成低底薪、培训贷、疑似外包、职位名与职责不符、明显加班文化、职责模糊、经验要求异常。
- 用中文，简洁。`

export function buildAnalyzeJobPrompt(job: Job): { system: string; user: string } {
  const user = `职位：${job.title}
公司：${job.company.name}（${job.company.industry || '行业未知'}，${job.company.scale || '规模未知'}）
薪资：${job.salary || '面议'}
地点：${job.location}
经验要求：${job.experienceRequirement || '未注明'}
学历要求：${job.educationRequirement || '未注明'}
技能标签：${job.skills.join('、') || '无'}

职位描述：
${job.description || '（无描述）'}`
  return { system: SYSTEM, user }
}

// ---------- 匹配分析 ----------

export const MATCH_SYSTEM = `你是求职匹配分析引擎。对比「职位」「候选人简历」「候选人事实库」，输出结构化 JSON。
硬性要求：
1. matchScore 是 0-100 的整数，反映真实匹配度，不要讨好式打分。
2. matchedSkills/missingSkills/strongPoints/weakPoints/resumeIssues/jobRisks/recommendations 都是字符串数组：依据用「｜」拼进同一条字符串。
3. jobRisks 用「标签｜依据」格式（销售/外包/加班/培训贷/名实不符等），没有风险则空数组。
4. fabricationChecks 只输出 status=missing 的技能（事实库里已有的不要列）。
5. 全部用中文。

【速度要求——严格遵守，输出越短越好】
matchedSkills ≤5 条、missingSkills ≤4 条、strongPoints ≤3 条、weakPoints ≤3 条、resumeIssues ≤4 条、jobRisks ≤3 条、recommendations ≤4 条、fabricationChecks ≤5 条；每条 ≤25 字。
understanding 字段省略（不要输出）。

【输出 JSON 结构——所有键必须存在，数组为字符串数组，禁止用对象】
{"matchScore":76,"matchedSkills":["Python（3 个项目均使用）"],"missingSkills":["RAG（资料未发现）"],"strongPoints":["独立完成 aicross.org 全栈"],"weakPoints":["无大型团队项目"],"resumeIssues":["未突出 RAG 经验"],"jobRisks":[],"recommendations":["补充 RAG 实践细节"],"fabricationChecks":[{"skill":"RAG","status":"missing","question":"是否了解 RAG？"}],"summary":"一句话总结"}
只输出 JSON 本体，不要解释。`

export function buildMatchResumePrompt(input: {
  job: Job
  resume: Resume
  factProfile: UserFactProfile
}): { system: string; user: string } {
  const { job, resume, factProfile } = input
  const user = `<职位>
${JSON.stringify(
  {
    title: job.title,
    company: job.company.name,
    salary: job.salary,
    location: job.location,
    experience: job.experienceRequirement,
    education: job.educationRequirement,
    skills: job.skills,
    description: job.description,
  },
  null,
  1,
)}
</职位>

<候选人简历>
${JSON.stringify(resume, null, 1)}
</候选人简历>

<事实库（唯一事实来源）>
${JSON.stringify(factProfile, null, 1)}
</事实库>`
  return { system: MATCH_SYSTEM, user }
}

/** 一次调用完成：岗位理解 + 匹配分析（合并输出，减少请求次数） */
export const AnalyzeOutputSchema = MatchAnalysisSchema.extend({
  // 模型可能漏掉 understanding 整个对象，给默认值兜底
  understanding: JobUnderstandingSchema.default({
    coreResponsibilities: [],
    hardRequirements: [],
    keySkills: [],
    teamAndRoleContext: '',
    redFlags: [],
  }),
})
export type AnalyzeOutput = z.infer<typeof AnalyzeOutputSchema>

export function mergeAnalysis(a: AnalyzeOutput): { analysis: MatchAnalysis; understanding: JobUnderstanding } {
  const { understanding, ...analysis } = a
  return { analysis: MatchAnalysisSchema.parse(analysis), understanding }
}
