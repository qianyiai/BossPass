import { defineUnlistedScript } from '#imports'
import { detectBossPageKind, extractJobIdFromUrl, matchesBoss } from '@/adapters/boss/detector'
import {
  fetchBossData,
  fetchJobDetail,
  getUserInfo,
  wapiFetch,
  type WapiResp,
} from '@/adapters/boss/api'
import { mergeBossDetail, parseBossJobItem } from '@/adapters/boss/parser'
import { fillChatInput } from '@/adapters/boss/messenger'
import { readChatFromDom } from '@/adapters/boss/chat'
import { getContainerVue, getRootVue, readVueData } from '@/adapters/boss/vue-hook'
import type { BossZpDetailData, BossZpJobItemData } from '@/adapters/boss/types'
import type { ChatMessage } from '@/applications/schema/application'
import { JobSchema, splitDescriptionBlocks } from '@/jobs/schema/job'
import type { Job } from '@/jobs/schema/job'
import type { PageInfo, SendResult } from '@/adapters/types'
import {
  BRIDGE_CALL_EVENT,
  BRIDGE_RESULT_EVENT,
  PAGE_CHANGED_EVENT,
  type BridgeCall,
  type BridgeResult,
} from '@/message/protocol'
import { logger } from '@/utils/logger'

/**
 * 注入脚本（页面主 world）。
 * 拥有页面完整上下文：window._PAGE / Vue 实例 / 带凭证的 wapi fetch。
 * 通过 CustomEvent 桥响应 content script 的调用。
 */

type Vue2Instance = Record<string, unknown> & { __vue__?: Vue2Instance }

/** 从页面 HTML 中扫描 securityId/lid（详情页 SSR 数据里带令牌） */
function scanPageTokens(): { securityId: string; lid: string } {
  try {
    const html = document.documentElement.outerHTML
    const securityId = html.match(/"securityId":"([^"\\]{5,80})"/)?.[1] ?? ''
    const lid = html.match(/"lid":"([^"\\]{5,80})"/)?.[1] ?? ''
    return { securityId, lid }
  } catch {
    return { securityId: '', lid: '' }
  }
}

/** 深度遍历 Vue2 组件树查找 jobDetail（容器 selector 失效时的兜底） */
async function findJobDetailDeep(timeoutMs = 8000): Promise<{ detail: BossZpDetailData; lid: string } | null> {
  try {
    const root = await getRootVue(timeoutMs)
    const start = Date.now()
    for (;;) {
      const queue: Vue2Instance[] = [root as Vue2Instance]
      let visited = 0
      while (queue.length && visited < 400) {
        const v = queue.shift()!
        visited++
        const d = v['jobDetail'] as BossZpDetailData | undefined
        if (d && d.jobInfo) return { detail: d, lid: d.lid ?? '' }
        const children = v['$children'] as Vue2Instance[] | undefined
        if (Array.isArray(children)) queue.push(...children)
      }
      if (Date.now() - start > timeoutMs) return null
      await new Promise((r) => setTimeout(r, 300))
    }
  } catch {
    return null
  }
}

/** DOM 提取 JD（最后兜底：只读页面文本，无 securityId） */
function extractJobFromDom(encryptJobId: string): Job | null {
  const title =
    document.querySelector('.job-banner .name, .job-primary .name, .job-name, h1')?.textContent?.trim() ?? ''
  const salary =
    document.querySelector('.job-banner .salary, .job-primary .salary, .salary')?.textContent?.trim() ?? ''
  const jd =
    document.querySelector('.job-sec-text')?.textContent?.trim() ??
    document.querySelector('.job-detail-section')?.textContent?.trim() ??
    ''
  if (!title && !jd) return null
  const base = parseBossJobItem({
    encryptJobId,
    securityId: '',
    jobName: title || '未知岗位',
    salaryDesc: salary || '',
  })
  if (!jd) return base
  const { responsibilities, requirements } = splitDescriptionBlocks(jd)
  return JobSchema.parse({
    ...base,
    description: jd,
    responsibilities: responsibilities.length ? responsibilities : base.responsibilities,
    requirements: requirements.length ? requirements : base.requirements,
  })
}

/** 等待详情数据就绪（hook 兜底：轮询容器组件 jobDetail） */
async function pollHookedJobDetail(timeoutMs = 8000): Promise<{ detail: BossZpDetailData; lid: string } | null> {
  try {
    const vue = await getContainerVue(timeoutMs)
    const start = Date.now()
    for (;;) {
      const detail = readVueData(vue, 'jobDetail') as BossZpDetailData | null | undefined
      if (detail && detail.jobInfo) return { detail, lid: detail.lid ?? '' }
      if (Date.now() - start > timeoutMs) return null
      await new Promise((r) => setTimeout(r, 200))
    }
  } catch {
    return null
  }
}

async function getInfo(): Promise<PageInfo> {
  const url = location.href
  return {
    platform: 'boss',
    pageKind: detectBossPageKind(url),
    url,
    jobKey: extractJobIdFromUrl(url) ? `boss::${extractJobIdFromUrl(url)}` : undefined,
    user: getUserInfo(),
  }
}

/** 当前岗位：URL/页面扫描拿 securityId 走 REST → Vue 深度 hook → DOM 提取 → 基础信息 */
async function getCurrentJob(): Promise<Job | null> {
  const url = new URL(location.href)
  const m = extractJobIdFromUrl(location.href)
  if (!m) return null

  // 令牌：URL 参数 → 页面 HTML 扫描
  let securityId = url.searchParams.get('securityId') ?? ''
  let lid = url.searchParams.get('lid') ?? ''
  if (!securityId) {
    const scanned = scanPageTokens()
    if (scanned.securityId) {
      securityId = scanned.securityId
      lid = lid || scanned.lid
      logger.info('securityId 从页面数据中扫描获得')
    }
  }
  if (!lid) lid = m

  // 主路径：REST detail.json（校验返回的是当前岗位）
  if (securityId) {
    try {
      const detail = await fetchJobDetail(securityId, lid)
      const detailJobId = detail.jobInfo?.encryptId ?? ''
      if (detailJobId && detailJobId !== m) {
        throw new Error(`详情与当前岗位不匹配: ${detailJobId}`)
      }
      const job = parseBossJobItem({
        encryptJobId: m,
        securityId,
        lid,
        jobName: detail.jobInfo?.jobName ?? detail.jobInfo?.positionName ?? '',
        salaryDesc: detail.jobInfo?.salaryDesc,
        skills: detail.jobInfo?.showSkills,
        jobExperience: detail.jobInfo?.experienceName,
        jobDegree: detail.jobInfo?.degreeName,
        brandName: detail.brandComInfo?.brandName,
        brandLogo: detail.brandComInfo?.logo,
        brandIndustry: detail.brandComInfo?.industryName,
        brandScaleName: detail.brandComInfo?.scaleName,
        brandStageName: detail.brandComInfo?.stageName,
        bossName: detail.bossInfo?.name,
        bossTitle: detail.bossInfo?.title,
        encryptBossId: detail.bossInfo?.encryptBossId,
        bossOnline: detail.bossInfo?.bossOnline,
        welfareList: detail.jobInfo?.welfareList,
      })
      return mergeBossDetail(job, detail)
    } catch (e) {
      logger.warn('REST 详情失败，回退 Vue hook：', e)
    }
  }

  // 兜底 1：容器 hook 的 jobDetail
  const hooked = await pollHookedJobDetail()
  // 兜底 2：深度遍历组件树找 jobDetail（新版页面容器 selector 变化时）
  const deep = hooked ?? (await findJobDetailDeep())
  if (deep) {
    const detail = deep.detail
    const job = parseBossJobItem({
      encryptJobId: m,
      securityId: detail.securityId ?? securityId,
      lid: detail.lid ?? lid,
      jobName: '',
    })
    return mergeBossDetail(job, detail)
  }

  // 兜底 3：从 DOM 直接提取标题/薪资/JD 文本（无 securityId，可分析但部分发送能力受限）
  const fromDom = extractJobFromDom(m)
  if (fromDom) {
    logger.info('使用 DOM 提取岗位数据')
    return fromDom
  }

  // 最后：仅基础信息
  return parseBossJobItem({ encryptJobId: m, securityId, jobName: '' })
}

async function listVisibleJobs(): Promise<Job[]> {
  const out = new Map<string, Job>()
  // 主路径：hook 容器组件的 jobList（参考 boss-helper 已验证方案）
  try {
    const vue = await getContainerVue(6000)
    const list = readVueData(vue, 'jobList') as BossZpJobItemData[] | undefined
    if (Array.isArray(list)) {
      for (const item of list) {
        if (item?.encryptJobId) out.set(item.encryptJobId, parseBossJobItem(item))
      }
    }
  } catch (e) {
    logger.warn('jobList hook 失败', e)
  }
  // 兕底：从岗位卡片组件实例的 props 提取（首页/改版场景）
  if (out.size === 0) {
    try {
      const anchors = document.querySelectorAll<HTMLAnchorElement>('a[href*="/job_detail/"]')
      for (const a of Array.from(anchors).slice(0, 60)) {
        let el: Element | null = a
        for (let depth = 0; depth < 6 && el; depth++) {
          const vue = (el as unknown as { __vue__?: { $props?: Record<string, unknown> } }).__vue__
          if (vue?.$props) {
            for (const v of Object.values(vue.$props)) {
              const item = v as BossZpJobItemData
              if (item && typeof item === 'object' && typeof item.encryptJobId === 'string' && item.encryptJobId && !out.has(item.encryptJobId)) {
                out.set(item.encryptJobId, parseBossJobItem(item))
              }
            }
            break
          }
          el = el.parentElement
        }
      }
    } catch (e) {
      logger.warn('岗位卡片提取失败', e)
    }
  }
  return Array.from(out.values())
}

const handlers: Record<string, (payload: unknown) => Promise<unknown>> = {
  'page.getInfo': async () => getInfo(),
  'job.getCurrent': async () => getCurrentJob(),
  'job.listVisible': async () => listVisibleJobs(),
  'chat.send': async (payload) => {
    const { text, send } = (payload ?? {}) as { text?: string; send?: boolean }
    if (!text) return { ok: false, via: 'fill-chat-input', message: '消息为空' }
    return fillChatInput(text, send === true) as Promise<SendResult>
  },
  'chat.read': async () => readChatFromDom() as ChatMessage[],
  'boss.fetchBossData': async (payload) => {
    const { encryptUserId, securityId } = (payload ?? {}) as { encryptUserId?: string; securityId?: string }
    if (!encryptUserId) throw new Error('缺少 encryptUserId')
    return fetchBossData(encryptUserId, securityId ?? '')
  },
  'boss.fetchJobDetail': async (payload) => {
    const { securityId, lid } = (payload ?? {}) as { securityId?: string; lid?: string }
    if (!securityId) throw new Error('缺少 securityId')
    return fetchJobDetail(securityId, lid ?? '')
  },
  'boss.wapi': async (payload) => {
    const { path, init } = (payload ?? {}) as { path?: string; init?: Parameters<typeof wapiFetch>[1] }
    if (!path) throw new Error('缺少 path')
    return wapiFetch<WapiResp<unknown>>(path, init)
  },
}

function handleCall(raw: unknown) {
  const call = raw as BridgeCall
  if (!call || typeof call !== 'object' || typeof call.id !== 'string' || typeof call.method !== 'string') return
  const handler = handlers[call.method]
  const reply = (result: BridgeResult) => {
    window.dispatchEvent(
      new CustomEvent(BRIDGE_RESULT_EVENT, { detail: JSON.stringify(result) }),
    )
  }
  Promise.resolve()
    .then(() => (handler ? handler(call.payload) : Promise.reject(new Error(`未知方法: ${call.method}`))))
    .then((data) => reply({ id: call.id, ok: true, data }))
    .catch((e: unknown) => reply({ id: call.id, ok: false, error: e instanceof Error ? e.message : String(e) }))
}

export default defineUnlistedScript(() => {
  if (!matchesBoss(location.href)) return
  logger.info('injected 启动', location.pathname)

  window.addEventListener(BRIDGE_CALL_EVENT, (e) => {
    const detail = (e as CustomEvent<string>).detail
    try {
      handleCall(typeof detail === 'string' ? JSON.parse(detail) : detail)
    } catch (err) {
      logger.error('bridge call parse failed', err)
    }
  })

  // SPA 路由变化 → 通知 content → 通知 sidepanel
  let lastUrl = location.href
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href
      window.dispatchEvent(new CustomEvent(PAGE_CHANGED_EVENT, { detail: JSON.stringify({ url: lastUrl }) }))
    }
  }, 500)
})
