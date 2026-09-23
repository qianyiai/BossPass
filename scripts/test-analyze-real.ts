/* 端到端验证：使用项目内真实代码路径
 *  1) PDF 提取 → 2) 解析（normalizeParsedResume）→ 3) 岗位分析（generateObject 计时 + generateText+parseJsonLoose 修复路径）
 *  用法: BOSSPASS_KEY=key.txt内容 node .output/test-analyze-real.mjs <pdf>
 */
import fs from 'node:fs'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { generateText, generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { AnalyzeOutputSchema, buildMatchResumePrompt } from '@/ai/prompts/analyze-job'
import { buildParseResumePrompt, normalizeParsedResume } from '@/ai/prompts/parse-resume'
import { parseJsonLoose } from '@/ai/agents'
import { randomId } from '@/utils/logger'

const key = (process.env.BOSSPASS_KEY ?? '').replace(/^key=/, '').trim()
const base = 'https://open.bigmodel.cn/api/paas/v4'
const modelName = 'glm-5.3-flashx'
const provider = createOpenAI({ baseURL: base, apiKey: key, name: 'bosspass-test' })
const lm = provider.chat(modelName)

async function extractPdf(path: string): Promise<string> {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(path)), useWorkerFetch: false, isEvalSupported: false, disableFontFace: true }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>) {
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
  return pages.join('\n\n')
}

const resumeText = await extractPdf(process.argv[2]!)
console.log(`[extract] chars=${resumeText.length} 头40=${JSON.stringify(resumeText.slice(0, 40))}`)

// ---- 1) 解析（真实 normalizeParsedResume 路径） ----
const pp = buildParseResumePrompt(resumeText)
const pRes = await generateText({ model: lm, system: pp.system, prompt: pp.user, temperature: 0.4, maxOutputTokens: 16000 })
const resume = normalizeParsedResume(parseJsonLoose(pRes.text, z.unknown()))
console.log(`[parse] finish=${pRes.finishReason} name=${resume.profile.name} 经历=${resume.experience.length} 技能=${resume.skills.length}`)

const factProfile = {
  skills: resume.skills.slice(0, 20),
  techStack: [],
  yearsOfExperience: '3',
  workRights: '',
  visas: '',
  location: resume.profile.location,
  availableFrom: '随时',
  expectedSalary: '15-25K',
  currentSalary: '',
  preferences: [],
  qaNotes: [],
  updatedAt: Date.now(),
}

const job = {
  title: 'AI 应用工程师（大模型方向）',
  company: { name: '某互联网科技公司', industry: '互联网', scale: '150-500人', logo: '', stage: '', introduce: '', platformCompanyId: '' },
  salary: '18-28K·14薪',
  location: '上海-徐汇',
  experienceRequirement: '1-3年',
  educationRequirement: '本科',
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

const ap = buildMatchResumePrompt({ job, resume, factProfile } as never)

// ---- 2) generateObject 路径计时（插件真实第一步） ----
try {
  const t = Date.now()
  const r = await generateObject({
    model: lm,
    schema: AnalyzeOutputSchema,
    system: ap.system,
    prompt: ap.user,
    temperature: 0.4,
    abortSignal: AbortSignal.timeout(300000),
  })
  console.log(`[analyze generateObject] ${(Date.now() - t) / 1000}s OK matchScore=${r.object.matchScore} matched=${r.object.matchedSkills.length}`)
  console.log('=== PASS via generateObject ===')
  process.exit(0)
} catch (e) {
  console.log(`[analyze generateObject] 失败 → ${(e as Error).message.slice(0, 160)}`)
}

// ---- 3) generateText + parseJsonLoose（修复后的回退路径，也是重点） ----
const t = Date.now()
const r2 = await generateText({
  model: lm,
  system: ap.system,
  prompt: ap.user,
  temperature: 0.4,
  maxOutputTokens: 16000,
  abortSignal: AbortSignal.timeout(300000),
})
console.log(`[analyze text路径] ${(Date.now() - t) / 1000}s finish=${r2.finishReason} len=${r2.text.length}`)
const analysis = parseJsonLoose(r2.text, AnalyzeOutputSchema)
console.log(`[analyze text路径] 解析成功: matchScore=${analysis.matchScore} matchedSkills=${JSON.stringify(analysis.matchedSkills.slice(0, 3))} missing=${JSON.stringify(analysis.missingSkills.slice(0, 3))} fabrication=${JSON.stringify(analysis.fabricationChecks.slice(0, 2))} understandingKeys=${Object.keys(analysis.understanding ?? {}).length}`)
void randomId
console.log('=== PASS via generateText+parseJsonLoose ===')
