// 验证 glm-5.3 在 16k 输出预算下能否完成分析任务
const fs = require('fs')
const key = process.env.GL_KEY
const base = process.env.GL_BASE

async function main() {
  const t = Date.now()
  const res = await fetch(base.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: 'glm-5.3',
      messages: [
        {
          role: 'system',
          content:
            '你是求职匹配分析引擎。输出 JSON：{"matchScore":0,"matchedSkills":[],"missingSkills":[],"strongPoints":[],"weakPoints":[],"resumeIssues":[],"jobRisks":[],"recommendations":[],"fabricationChecks":[],"summary":""}。所有键必须存在。只输出 JSON。',
        },
        {
          role: 'user',
          content:
            '职位：AI 应用工程师，要求 Python/LLM/RAG/向量数据库。候选人：3年经验，AI 全栈开发，会 Python/JavaScript，做过大模型私有化部署、企业知识库、RAG、Agent 工作流。输出分析。',
        },
      ],
      temperature: 0.4,
      max_tokens: 16000,
    }),
  })
  const j = await res.json()
  const msg = j.choices?.[0]?.message
  console.log('elapsed', (Date.now() - t) / 1000, 'finish', j.choices?.[0]?.finish_reason, 'usage', JSON.stringify(j.usage))
  const c = msg?.content ?? ''
  try {
    const cleaned = c.replace(/```(?:json)?/g, '').replace(/```/g, '').trim()
    const start = cleaned.search(/[[{]/)
    const o = JSON.parse(cleaned.slice(start))
    console.log('JSON OK matchScore=', o.matchScore)
  } catch (e) {
    console.log('JSON FAIL', e.message, 'contentLen', c.length)
  }
}
main()
