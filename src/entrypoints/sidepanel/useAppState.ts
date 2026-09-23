import { computed, reactive, ref, watch } from 'vue'
import { analyzeJobAndMatch, generateChatReplies, generateGreeting, optimizeResumeForJob } from '@/ai/agents/tasks'
import type { MatchAnalysis } from '@/applications/schema/application'
import { STATUS_ORDER, type Application, type ApplicationStatus } from '@/applications/schema/application'
import type { Job } from '@/jobs/schema/job'
import { applyChanges } from '@/resume/diff'
import { createMasterResumeFromText } from '@/resume/master'
import { extractTextFromPdf, isSupportedResumeFile } from '@/resume/parser/pdf'
import type { MasterResume, Resume, ResumeVersion } from '@/resume/schema/resume'
import { mergeBossDetail } from '@/adapters/boss/parser'
import {
  getActiveMasterResume,
  cacheJob,
  getApplicationByJobKey,
  getCachedJob,
  upsertApplication,
} from '@/storage/db'
import { loadSettings, saveSettings, type Settings } from '@/storage/settings'
import { rpc } from '@/message/rpc-client'
import { randomId, logger } from '@/utils/logger'

/** 全局单例状态（Side Panel） */

export const settings = ref<Settings | null>(null)
export const master = ref<MasterResume | null>(null)
export const job = ref<Job | null>(null)
export const pageInfo = ref<{ pageKind: string; url: string } | null>(null)
export const analysis = ref<MatchAnalysis | null>(null)
export const analyzing = ref(false)
export const application = ref<Application | null>(null)
/** 列表页可见岗位（详情页之外的场景） */
export const visibleJobs = ref<Job[]>([])
/** 连接/页面脚本错误提示（区别于"未识别岗位"） */
export const connectionError = ref('')

// 简历优化
export const optimizing = ref(false)
export const pendingChanges = ref<OptimizeChange[]>([])
export const optimizedResume = ref<Resume | null>(null)
export const scoreAfterOptimize = ref<number | null>(null)
export interface OptimizeChange {
  path: string
  label: string
  before: string
  after: string
  reason: string
  status: 'pending' | 'accepted' | 'rejected'
  needFact?: { question: string } | null
}

// 打招呼
export const greeting = ref('')
export const greetingNotes = ref<string[]>([])
export const generatingGreeting = ref(false)
export const sendingGreeting = ref(false)
export const greetingResult = ref<string>('')

// 聊天辅助
export const chatMessages = ref<Array<{ role: 'me' | 'hr'; content: string }>>([])
export const chatReplies = ref<Array<{ style: string; content: string; grounded: boolean; note?: string }>>([])
export const missingInfo = ref<string[]>([])
export const loadingChat = ref(false)
export const generatingReplies = ref(false)

export const hasProvider = computed(
  () => Array.isArray(settings.value?.providers) && (settings.value?.providers.length ?? 0) > 0,
)

export async function reloadSettings() {
  settings.value = await loadSettings()
}

export async function persistSettings(s: Settings) {
  settings.value = s
  await saveSettings(s)
}

export async function loadMaster() {
  master.value = (await getActiveMasterResume()) ?? null
}

/** 上传 PDF → 文本 →（AI）结构化 → Master Resume */
export async function uploadResumePdf(file: File) {
  if (!isSupportedResumeFile(file)) throw new Error('第一版仅支持 PDF 简历')
  const text = await extractTextFromPdf(file)
  if (!text.trim()) throw new Error('未能从 PDF 提取到文本（可能是扫描件）')
  master.value = await createMasterResumeFromText(text)
  return master.value
}

/** 读取当前 BOSS 岗位（页面 RPC），并落缓存/申请记录；列表页则拉取可见岗位 */
export async function refreshJob(): Promise<Job | null> {
  connectionError.value = ''
  try {
    pageInfo.value = await rpc.getPageInfo()
  } catch (e) {
    // content script 未注入（扩展安装后未刷新页面）或非 BOSS 页面
    pageInfo.value = { pageKind: 'other', url: '' }
    connectionError.value = e instanceof Error ? e.message : String(e)
    job.value = null
    visibleJobs.value = []
    return null
  }
  try {
    const j = await rpc.getCurrentJob()
    if (j) {
      job.value = j
      visibleJobs.value = []
      await cacheJob(j)
      await ensureApplication(j)
      return j
    }
  } catch (e) {
    logger.warn('getCurrentJob failed', e)
  }
  job.value = null
  // 列表页/首页：拉取可见岗位供用户选择
  try {
    visibleJobs.value = await rpc.listVisibleJobs()
  } catch (e) {
    logger.warn('listVisibleJobs failed', e)
    visibleJobs.value = []
  }
  return null
}

/** 从列表选择岗位 → 拉 JD 详情 → 作为当前岗位 */
export async function selectJob(item: Job): Promise<Job | null> {
  connectionError.value = ''
  let j = item
  if (item.securityId) {
    try {
      const detail = await rpc.fetchJobDetail(item.securityId, item.lid || item.jobId)
      j = mergeBossDetail(item, detail as Parameters<typeof mergeBossDetail>[1])
    } catch (e) {
      logger.warn('详情获取失败，使用列表数据', e)
    }
  }
  job.value = j
  await cacheJob(j)
  await ensureApplication(j)
  return j
}

async function ensureApplication(j: Job): Promise<Application> {
  let app = await getApplicationByJobKey(j.key)
  if (!app) {
    app = {
      id: randomId('app'),
      jobKey: j.key,
      platform: j.platform,
      company: j.company.name,
      jobTitle: j.title,
      jobUrl: j.url,
      jobId: j.jobId,
      jobDescriptionSnapshot: j.description.slice(0, 8000),
      hrName: j.hr.name,
      status: 'Viewed',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: [],
      notes: [],
      matchScore: -1,
      matchAnalysis: null,
      resumeVersionId: '',
      greeting: '',
    }
    await upsertApplication(app)
  }
  application.value = app
  return app
}

async function advanceStatus(minStatus: ApplicationStatus) {
  const app = application.value
  if (!app) return
  const currentIdx = STATUS_ORDER.indexOf(app.status)
  const minIdx = STATUS_ORDER.indexOf(minStatus)
  if (minIdx > currentIdx) {
    app.status = minStatus
    await upsertApplication(app)
  }
}

/** AI 岗位分析 */
export async function runAnalyze() {
  const m = master.value
  const j = job.value
  if (!m) throw new Error('请先上传并解析 Master Resume（「简历」页）')
  if (!j) throw new Error('未识别到岗位，请打开 BOSS 岗位详情页后刷新')
  analyzing.value = true
  try {
    const { analysis: a } = await analyzeJobAndMatch({ job: j, resume: m.resume, factProfile: m.factProfile })
    analysis.value = a
    if (application.value) {
      application.value.matchScore = a.matchScore
      application.value.matchAnalysis = a
      await upsertApplication(application.value)
    }
    await advanceStatus('Analyzed')
  } finally {
    analyzing.value = false
  }
}

/** AI 优化简历 → 生成待审阅变更 */
export async function runOptimize() {
  const m = master.value
  const j = job.value
  if (!m || !j) throw new Error('需要 Master Resume 与当前岗位')
  optimizing.value = true
  try {
    const out = await optimizeResumeForJob({
      job: j,
      resume: m.resume,
      factProfile: m.factProfile,
      matchAnalysis: analysis.value,
    })
    // 有 AI changes 用之；否则本地 diff 兜底
    const changes: OptimizeChange[] = (out.changes.length ? out.changes : []).map((c) => ({
      ...c,
      status: 'pending' as const,
      needFact: null,
    }))
    pendingChanges.value = changes
    optimizedResume.value = out.optimizedResume
    scoreAfterOptimize.value = out.scoreAfterOptimize ?? null
    // gaps 提示合并进 changes 之外单独展示（用户补充事实流程）
    gaps.value = out.gaps.map((g) => ({ skill: g.skill, question: g.question, answer: '' }))
  } finally {
    optimizing.value = false
  }
}

export const gaps = ref<Array<{ skill: string; question: string; answer: string }>>([])

/** 用户补充"我有相关经验"的回答 → 写入事实库 */
export async function submitGapFact(index: number) {
  const g = gaps.value[index]
  const m = master.value
  if (!g || !m || !g.answer.trim()) return
  m.factProfile.qaNotes.push({ question: g.question, answer: g.answer.trim() })
  m.factProfile.skills.push(g.skill)
  m.factProfile.updatedAt = Date.now()
  await import('@/storage/db').then((db) => db.saveMasterResume(m))
  gaps.value.splice(index, 1)
}

export function ignoreGap(index: number) {
  gaps.value.splice(index, 1)
}

/** 保存优化结果为岗位 Resume Version */
export async function saveOptimizedVersion(): Promise<ResumeVersion | null> {
  const m = master.value
  const j = job.value
  if (!m || !j || !optimizedResume.value) return null
  const accepted = pendingChanges.value.filter((c) => c.status === 'accepted')
  const finalResume = applyChanges(m.resume, accepted.map((c) => ({ ...c, status: 'accepted' as const })))
  const version: ResumeVersion = {
    id: randomId('ver'),
    masterId: m.id,
    jobKey: j.key,
    jobId: j.jobId,
    jobTitle: j.title,
    company: j.company.name,
    matchScore: analysis.value?.matchScore ?? -1,
    resume: finalResume,
    jobDescriptionSnapshot: j.description.slice(0, 4000),
    createdAt: Date.now(),
  }
  await import('@/storage/db').then((db) => db.saveResumeVersion(version))
  if (application.value) {
    application.value.resumeVersionId = version.id
    await upsertApplication(application.value)
  }
  await advanceStatus('ResumeOptimized')
  return version
}

/** 生成打招呼 */
export async function runGenerateGreeting() {
  const m = master.value
  const j = job.value
  if (!m || !j) throw new Error('需要 Master Resume 与当前岗位')
  if (!settings.value) return
  generatingGreeting.value = true
  try {
    const out = await generateGreeting({
      job: j,
      resume: optimizedResume.value ?? m.resume,
      factProfile: m.factProfile,
      matchAnalysis: analysis.value,
      style: settings.value.greeting,
    })
    greeting.value = out.greeting
    greetingNotes.value = out.notes
    await advanceStatus('GreetingGenerated')
  } finally {
    generatingGreeting.value = false
  }
}

/** 发送打招呼（填入聊天框，用户确认发送） */
export async function sendGreetingText(mode: 'fill' | 'confirm-send') {
  if (!greeting.value.trim()) return
  sendingGreeting.value = true
  try {
    const res = await rpc.sendGreeting({ text: greeting.value, mode })
    greetingResult.value = res.message ?? (res.ok ? '已操作' : '失败')
    if (res.ok) await advanceStatus('Contacted')
    return res
  } finally {
    sendingGreeting.value = false
  }
}

/** 读取聊天记录 */
export async function loadChat() {
  loadingChat.value = true
  try {
    const msgs = await rpc.readChat()
    chatMessages.value = msgs.map((m) => ({ role: m.role === 'me' ? 'me' : 'hr', content: m.content }))
    if (application.value) {
      application.value.messages = msgs
      await upsertApplication(application.value)
      if (msgs.some((m) => m.role === 'hr')) await advanceStatus('HRReplied')
    }
  } finally {
    loadingChat.value = false
  }
}

/** 生成聊天回复建议 */
export async function runGenerateReplies() {
  const m = master.value
  const j = job.value
  if (!m || !j) return
  const latest = [...chatMessages.value].reverse().find((m) => m.role === 'hr')
  if (!latest) throw new Error('没有 HR 消息，请先读取聊天或手动粘贴')
  generatingReplies.value = true
  try {
    const out = await generateChatReplies({
      jobTitle: j.title,
      companyName: j.company.name,
      chatHistory: chatMessages.value,
      latestHRMessage: latest.content,
      resume: optimizedResume.value ?? m.resume,
      factProfile: m.factProfile,
    })
    chatReplies.value = out.replies.map((r) => ({ style: r.style, content: r.content, grounded: r.grounded, note: r.note }))
    missingInfo.value = out.missingInfo
  } finally {
    generatingReplies.value = false
  }
}

export async function sendReply(text: string, mode: 'fill' | 'confirm-send') {
  return rpc.sendGreeting({ text, mode })
}

// 页面变化自动刷新
export async function initAppState() {
  await reloadSettings()
  await loadMaster()
  try {
    await refreshJob()
  } catch {
    /* 页面不是 BOSS 或未连接 */
  }
}

watch(
  () => job.value?.key,
  () => {
    analysis.value = null
    pendingChanges.value = []
    optimizedResume.value = null
    greeting.value = ''
    chatMessages.value = []
    chatReplies.value = []
  },
)
