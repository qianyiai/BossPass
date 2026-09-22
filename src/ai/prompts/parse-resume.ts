import { ResumeSchema } from '@/resume/schema/resume'
import { z } from 'zod'

/** 导出的 Schema 供 agent 使用 */
export const ParsedResumeSchema = ResumeSchema

const SYSTEM = `你是简历解析引擎。把从 PDF/DOCX 提取的纯文本还原为结构化简历 JSON。
规则：
1. 严格保留原文中的事实（公司/职位/时间/成果数字），不要改写润色、不要翻译、不要补全缺失字段。
2. 文本可能乱序或粘连，按常见简历结构（个人信息/摘要/技能/工作经历/项目/教育/证书/语言）合理归位。
3. 时间统一为原文格式原样保留。
4. 无损优先：不确定的内容放入对应字段原文，不要丢弃。
5. 输出 JSON。`

export function buildParseResumePrompt(resumeText: string): { system: string; user: string } {
  const user = `<简历原文>
${resumeText.slice(0, 30000)}
</简历原文>`
  return { system: SYSTEM, user }
}
