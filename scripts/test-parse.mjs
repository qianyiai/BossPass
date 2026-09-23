// 端到端复现插件的简历解析 AI 调用（GLM bigmodel 兼容端点）
// 用法: GL_KEY=... GL_BASE=... GL_MODEL=... node scripts/test-parse.mjs <resume-text-file>
import fs from 'node:fs'

const key = process.env.GL_KEY
const base = process.env.GL_BASE
const model = process.env.GL_MODEL
const resumeText = fs.readFileSync(process.argv[2] ?? '', 'utf8')

if (!key || !base || !model) {
  console.error('missing GL_KEY / GL_BASE / GL_MODEL')
  process.exit(1)
}

const SKELETON = `{
  "profile": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
  "summary": "",
  "skills": [],
  "experience": [
    { "company": "", "title": "", "startDate": "", "endDate": "", "location": "", "bullets": ["", ""] }
  ],
  "projects": [
    { "name": "", "role": "", "startDate": "", "endDate": "", "url": "", "bullets": ["", ""] }
  ],
  "education": [
    { "school": "", "degree": "", "major": "", "startDate": "", "endDate": "" }
  ],
  "certifications": [],
  "languages": []
}`

const SYSTEM = `你是简历解析引擎。把从 PDF/DOCX 提取的纯文本还原为结构化简历 JSON。
【输出结构——必须严格符合，所有键都必须存在，无内容用 "" 或 []，禁止改键名、禁止增删顶层键】
${SKELETON}

规则：
1. 严格保留原文中的事实（公司/职位/时间/成果数字），不要改写润色、不要翻译、不要补全缺失字段。
2. 文本可能乱序或粘连，按常见简历结构合理归位。
3. 时间统一为原文格式原样保留。
4. bullets 是字符串数组；整段职责描述可拆成多条。
5. 只输出 JSON 本体，不要 markdown 代码块，不要解释。`

const USER = `<简历原文>\n${resumeText.slice(0, 30000)}\n</简历原文>`

// ---- 测试 1: 连通性 ping ----
const t0 = Date.now()
const ping = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({ model, messages: [{ role: 'user', content: '回复两个字：好的' }], max_tokens: 16 }),
})
const pingJson = await ping.json()
console.log(`[ping] http=${ping.status} ${(Date.now() - t0) / 1000}s`)
console.log(`[ping] content=${JSON.stringify(pingJson.choices?.[0]?.message?.content ?? pingJson.error ?? pingJson)}`)

// ---- 测试 2: 完整解析（与插件 parseResumeText 一致） ----
const t1 = Date.now()
const res = await fetch(`${base.replace(/\/$/, '')}/chat/completions`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: USER },
    ],
    temperature: 0.4,
    max_tokens: 8000,
  }),
})
const elapsed = (Date.now() - t1) / 1000
const json = await res.json()
console.log(`[parse] http=${res.status} elapsed=${elapsed}s`)
const msg = json.choices?.[0]?.message
console.log(`[parse] finish_reason=${json.choices?.[0]?.finish_reason}`)
console.log(`[parse] usage=${JSON.stringify(json.usage ?? null)}`)
const reasoning = msg?.reasoning_content ?? msg?.reasoning
if (reasoning) console.log(`[parse] reasoning_content length=${String(reasoning).length} 头80字=${JSON.stringify(String(reasoning).slice(0, 80))}`)
const content = msg?.content ?? ''
console.log(`[parse] content length=${content.length}`)
console.log(`[parse] content 头200字=${JSON.stringify(content.slice(0, 200))}`)
try {
  const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim()
  const start = cleaned.search(/[[{]/)
  const parsed = JSON.parse(cleaned.slice(start))
  console.log(`[parse] JSON.parse OK, 顶层键=${Object.keys(parsed).join(',')}`)
  console.log(`[parse] profile 存在=${parsed.profile !== undefined}, experience 数=${Array.isArray(parsed.experience) ? parsed.experience.length : '非数组'}`)
} catch (e) {
  console.log(`[parse] JSON.parse FAIL: ${e.message}`)
}
