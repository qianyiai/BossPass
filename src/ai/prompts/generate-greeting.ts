import { z } from 'zod'
import type { GreetingStyle } from '@/storage/settings'

const TONE_DESC: Record<GreetingStyle['tone'], string> = {
  natural: '自然口语化，像真人第一次打招呼',
  concise: '极简，一两句话，直击重点',
  professional: '专业书面，礼貌克制',
  proactive: '主动进取，表达强烈意愿并请求推进',
  tech: '技术视角，直接点出技术栈匹配点',
  product: '产品视角，强调业务理解与产品方法论',
}

export const GreetingOutputSchema = z.object({
  greeting: z.string(),
  notes: z.array(z.string()).default([]),
})

const SYSTEM = `你是打招呼文案生成器，为求职者生成发给 HR 的第一条消息。

【硬规则】
1. 只能使用输入中真实存在的信息（事实库/简历），禁止编造经历或数字。
2. 短：默认不超过指定长度；不要写成作文。
3. 自然：不用"贵司"连用、不用 AI 腔（"我相信"、"非常适合我"少用）、不排比、不堆砌关键词。
4. 结构参考：一句为什么对该岗位感兴趣（结合 JD 里具体的点）→ 一句最有针对性的匹配优势（1-2 个即可）→ 一句轻量收尾（希望进一步沟通）。
5. 按配置决定是否称呼 HR、是否提公司名、是否提具体项目。
6. 输出 JSON：greeting（正文，不要引号、不要"您好："以外的多余格式）、notes（给用户看的 1-3 条说明，如突出哪个优势）。`

export function buildGreetingPrompt(input: {
  jobTitle: string
  company: string
  hrName: string
  hrTitle: string
  jobSkills: string[]
  jdSummary: string
  resumeSummary: string
  highlightFacts: string[]
  style: GreetingStyle
}): { system: string; user: string } {
  const s = input.style
  const user = `岗位：${input.jobTitle}
公司：${s.mentionCompany ? input.company : '（不要提公司名）'}
HR：${s.addressHR ? `${input.hrName || ''}${input.hrTitle ? `（${input.hrTitle}）` : ''}` : '（不要称呼 HR）'}
语气：${TONE_DESC[s.tone]}
最大长度：${s.maxLength} 字

岗位关键词：${input.jobSkills.join('、')}
JD 要点：
${input.jdSummary}

候选人简历要点：
${input.resumeSummary}

可用于突出的真实事实：
${input.highlightFacts.map((f) => `- ${f}`).join('\n') || '-（无，注意更不能编造）'}

${s.mentionProject ? '可提及最相关的 1 个项目。' : '不要提具体项目。'}`
  return { system: SYSTEM, user }
}
