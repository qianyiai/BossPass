// 端到端复现「岗位分析」：解析简历 → 构造分析输入 → 对比 GLM 模型/思考档位
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const key = process.env.GL_KEY
const base = process.env.GL_BASE
const pdfPath = process.argv[2]

// ---- 1. 提取 PDF（同插件） ----
const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(pdfPath)), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise
const pages = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  let lastY = null
  let line = ''
  const lines = []
  for (const item of content.items) {
    const str = item.str ?? ''
    if (!str) continue
    const y = item.transform?.[5] ?? 0
    if (lastY !== null && Math.abs(y - lastY) > 2) { lines.push(line.trim()); line = '' }
    line += str
    lastY = y
    if (item.hasEOL) { lines.push(line.trim()); line = ''; lastY = null }
  }
  if (line.trim()) lines.push(line.trim())
  pages.push(lines.filter(Boolean).join('\n'))
}
await doc.destroy()
const resumeText = pages.join('\n\n')

// ---- 2. 解析简历（用最快的 flashx 得到 resume JSON） ----
async function chat(model, messages, maxTokens, thinking) {
  const t = Date.now()
  const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, messages, temperature: 0.4, max_tokens: maxTokens,
      ...(thinking ? { thinking: { type: thinking } } : {}),
    }),
  })
  const json = await res.json()
  return {
    ok: res.ok,
    status: res.status,
    err: json.error?.message,
    elapsed: (Date.now() - t) / 1000,
    finish: json.choices?.[0]?.finish_reason,
    usage: json.usage,
    content: json.choices?.[0]?.message?.content ?? '',
    reasoningLen: String(json.choices?.[0]?.message?.reasoning_content ?? '').length,
  }
}

function extractJson(content) {
  const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim()
  const start = cleaned.search(/[[{]/)
  return JSON.parse(cleaned.slice(start))
}

console.log('== 步骤1: 解析简历 (glm-5.3-flashx) ==')
const p = await chat('glm-5.3-flashx', [
  { role: 'system', content: '把简历文本还原为结构化 JSON。只输出 JSON。结构：{"profile":{"name","email","phone","location","linkedin","website"},"summary","skills":[],"experience":[{"company","title","startDate","endDate","location","bullets":[]}],"projects":[{"name","role","startDate","endDate","url","bullets":[]}],"education":[{"school","degree","major","startDate","endDate"}],"certifications":[],"languages":[]}。所有键必须存在。' },
  { role: 'user', content: `<简历原文>\n${resumeText}\n</简历原文>` },
], 8000)
const resume = extractJson(p.content)
console.log(`解析 ${p.elapsed}s, usage=${JSON.stringify(p.usage)}, name=${resume.profile?.name}, 经历数=${resume.experience?.length}`)

const factProfile = {
  skills: (resume.skills ?? []).slice(0, 20),
  techStack: [], yearsOfExperience: '3', workRights: '', visas: '',
  location: resume.profile?.location ?? '',
  availableFrom: '随时', expectedSalary: '15-25K', currentSalary: '',
  preferences: [], qaNotes: [], updatedAt: Date.now(),
}

// ---- 3. 合成真实感 JD ----
const job = {
  title: 'AI 应用工程师（大模型方向）',
  company: { name: '某互联网科技公司', industry: '互联网', scale: '150-500人' },
  salary: '18-28K·14薪', location: '上海-徐汇',
  experienceRequirement: '1-3年', educationRequirement: '本科',
  skills: ['Python', 'JavaScript', 'LLM', 'RAG', 'Prompt', '向量数据库', 'FastAPI', 'Redis'],
  description: `【岗位职责】
1. 负责大模型应用产品的设计与开发，包括生成式 AI 服务接入、Agent 工作流编排；
2. 搭建企业知识库与 RAG 检索链路，优化召回与问答效果；
3. 开发后端服务接口与异步任务处理，保障长耗时生成任务的稳定性；
4. 参与提示词工程优化与模型效果评测迭代。

【任职要求】
1. 本科及以上学历，1-3年后端/AI应用开发经验；
2. 熟悉 Python 或 JavaScript，有 LLM 应用落地经验者优先；
3. 了解向量数据库、企业知识库建设、提示词设计；
4. 有独立负责项目经验、能推进部署与上线者优先。`,
}

// ---- 4. 分析任务（与插件 buildMatchResumePrompt 一致） ----
const MATCH_SYSTEM = `你是求职匹配分析引擎。对比「职位」「候选人简历」「候选人事实库」，输出结构化 JSON。
硬性要求：
1. matchScore 是 0-100 的整数，反映真实匹配度，不要讨好式打分。
2. 每个字段都要解释"为什么"。matchedSkills/missingSkills/strongPoints/weakPoints 给出依据。
3. resumeIssues 指出简历中需要为该岗位改进的具体位置与问题。
4. jobRisks 用「标签｜依据」格式列出岗位风险，没有风险则空数组。
5. fabricationChecks：逐个检查 JD 的关键技能是否真实出现在 factProfile 中；出现→verified；没出现→missing 并生成追问 question。
6. recommendations 给出 3-6 条行动建议。全部用中文。
输出 JSON 结构：{"matchScore":0,"matchedSkills":[],"missingSkills":[],"strongPoints":[],"weakPoints":[],"resumeIssues":[],"jobRisks":[],"recommendations":[],"fabricationChecks":[{"skill":"","status":"verified","question":""}],"summary":""}。所有键必须存在。`

const user = `<职位>
${JSON.stringify({ title: job.title, company: job.company.name, salary: job.salary, location: job.location, experience: job.experienceRequirement, education: job.educationRequirement, skills: job.skills, description: job.description }, null, 1)}
</职位>

<候选人简历>
${JSON.stringify(resume, null, 1)}
</候选人简历>

<事实库（唯一事实来源）>
${JSON.stringify(factProfile, null, 1)}
</事实库>`

const messages = [
  { role: 'system', content: MATCH_SYSTEM },
  { role: 'user', content: user },
]

const variants = [
  ['glm-5.3-flashx', undefined],
]
for (const [model, thinking] of variants) {
  const label = `${model}${thinking ? ` + thinking:${thinking}` : ' + 默认思考'}`
  try {
    const r = await chat(model, messages, 8000, thinking)
    let jsonOk = false
    let score = '-'
    try {
      const j = extractJson(r.content)
      jsonOk = true
      score = j.matchScore
    } catch { /* ignore */ }
    console.log(`[${label}] ${r.elapsed}s ok=${r.ok} finish=${r.finish} reasoning=${r.reasoningLen} contentLen=${r.contentLen} json=${jsonOk} matchScore=${score}`)
    if (!r.ok) console.log(`  错误: ${r.err}`)
  } catch (e) {
    console.log(`[${label}] 异常: ${e.message}`)
  }
}
