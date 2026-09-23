// 端到端：PDF 提取（与插件一致）→ GLM 解析（对比 默认 vs thinking disabled）
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const key = process.env.GL_KEY
const base = process.env.GL_BASE
const model = process.env.GL_MODEL
const pdfPath = process.argv[2]

// ---- 提取（与插件 extractTextFromPdf 相同逻辑） ----
const buffer = fs.readFileSync(pdfPath)
const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise
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
console.log(`[extract] chars=${resumeText.length}`)
console.log(`[extract] 头60字=${JSON.stringify(resumeText.slice(0, 60))}`)

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
1. 严格保留原文中的事实，不要改写润色、不要翻译。
2. bullets 是字符串数组；整段职责描述可拆成多条。
3. 只输出 JSON 本体，不要 markdown 代码块，不要解释。`

const USER = `<简历原文>\n${resumeText.slice(0, 30000)}\n</简历原文>`

async function callParse(extraBody) {
  const t = Date.now()
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
      ...extraBody,
    }),
  })
  const json = await res.json()
  const msg = json.choices?.[0]?.message
  const content = msg?.content ?? ''
  let jsonOk = false
  let topKeys = ''
  try {
    const cleaned = content.replace(/```(?:json)?\s*([\s\S]*?)```/, '$1').trim()
    const start = cleaned.search(/[[{]/)
    const parsed = JSON.parse(cleaned.slice(start))
    jsonOk = true
    topKeys = Object.keys(parsed).join(',')
  } catch { /* ignore */ }
  return {
    http: res.status,
    elapsed: (Date.now() - t) / 1000,
    finish: json.choices?.[0]?.finish_reason,
    usage: json.usage,
    reasoningLen: String(msg?.reasoning_content ?? '').length,
    contentLen: content.length,
    head: JSON.stringify(content.slice(0, 120)),
    jsonOk,
    topKeys,
  }
}

// A: 默认（复现插件现状）
const a = await callParse({})
console.log(`[A 默认] ${a.elapsed}s finish=${a.finish} reasoning=${a.reasoningLen} content=${a.contentLen} json=${a.jsonOk} keys=${a.topKeys}`)
console.log(`[A 默认] usage=${JSON.stringify(a.usage)}`)
console.log(`[A 默认] 头120=${a.head}`)

// B: 按环境变量传 thinking 档位（low/high/max）
const thinking = process.env.GL_THINKING
const b = await callParse(thinking ? { thinking: { type: thinking } } : {})
console.log(`[B ${thinking ?? '默认'} model=${model}] ${b.elapsed}s finish=${b.finish} reasoning=${b.reasoningLen} content=${b.contentLen} json=${b.jsonOk} keys=${b.topKeys}`)
console.log(`[B] usage=${JSON.stringify(b.usage)}`)
console.log(`[B] 头120=${b.head}`)
