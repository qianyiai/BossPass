import { z } from 'zod'

export const ChatReplyOutputSchema = z.object({
  replies: z
    .array(
      z.object({
        style: z.enum(['concise', 'natural', 'detailed']),
        content: z.string(),
        grounded: z.boolean().default(true),
        note: z.string().default(''),
      }),
    )
    .min(1)
    .max(3),
  /** HR 问题中资料缺失的部分，提示用户补充 */
  missingInfo: z.array(z.string()).default([]),
})

const SYSTEM = `你是聊天回复助手，帮求职者回复 HR 的消息。

【硬规则】
1. 只能基于「事实库/简历」中真实存在的信息生成回复，禁止编造。
2. HR 问到资料中不存在的经验/技能时：
   - 对应回复 grounded=false，内容要诚实（例如"这块我实际项目中没有完整落地过，但我了解…"不得虚构项目）；
   - 并把缺失项写进 missingInfo，供界面提示用户补充真实经历。
3. 常见问题（到岗时间/期望薪资/离职原因/出差加班等）优先使用事实库 qaNotes 与对应字段的答案。
4. 生成最多 3 条：concise（一句话）、natural（自然两三句）、detailed（信息完整）。
5. 语气自然口语化，符合聊天场景，不要书面作文腔。`

export function buildChatReplyPrompt(input: {
  chatHistory: Array<{ role: 'me' | 'hr'; content: string }>
  latestHRMessage: string
  jobTitle: string
  companyName: string
  resumeSummary: string
  factProfileJSON: string
}): { system: string; user: string } {
  const history = input.chatHistory
    .slice(-20)
    .map((m) => `${m.role === 'me' ? '我' : 'HR'}：${m.content}`)
    .join('\n')
  const user = `岗位：${input.jobTitle} @ ${input.companyName}

<聊天记录>
${history || '（暂无）'}
</聊天记录>

HR 最新消息：${input.latestHRMessage}

候选人简历要点：${input.resumeSummary}

<事实库（唯一事实来源）>
${input.factProfileJSON}
</事实库>`
  return { system: SYSTEM, user }
}

// ---------- Follow-up ----------

export const FollowupOutputSchema = z.object({
  content: z.string(),
  note: z.string().default(''),
})

const FOLLOWUP_SYSTEM = `生成一条跟进消息（HR 一段时间未回复后发送）。
规则：简短友好，不施压不质问；可补充一条新的相关信息（真实存在的匹配点或新增进展）降低打扰感；只用真实信息。`

export function buildFollowupPrompt(input: {
  jobTitle: string
  hrName: string
  lastMyMessage: string
  chatHistory: Array<{ role: 'me' | 'hr'; content: string }>
  highlightFacts: string[]
}): { system: string; user: string } {
  const history = input.chatHistory
    .slice(-10)
    .map((m) => `${m.role === 'me' ? '我' : 'HR'}：${m.content}`)
    .join('\n')
  const user = `岗位：${input.jobTitle}
HR：${input.hrName || '（未知）'}

<最近聊天>
${history || '（无）'}
</最近聊天>

我最后一条消息：${input.lastMyMessage || '（无）'}

可补充的真实信息：
${input.highlightFacts.map((f) => `- ${f}`).join('\n') || '-（无）'}`
  return { system: FOLLOWUP_SYSTEM, user }
}
