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
import { getContainerVue, readVueData } from '@/adapters/boss/vue-hook'
import type { BossZpJobItemData } from '@/adapters/boss/types'
import type { ChatMessage } from '@/applications/schema/application'
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

/** 等待详情数据就绪（hook 兜底：轮询容器组件 jobDetail） */
async function pollHookedJobDetail(timeoutMs = 8000): Promise<{ detail: unknown; lid: string } | null> {
  try {
    const vue = await getContainerVue(timeoutMs)
    const start = Date.now()
    for (;;) {
      const detail = readVueData(vue, 'jobDetail') as
        | { lid?: string; jobInfo?: unknown; securityId?: string }
        | null
        | undefined
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

/** 当前岗位：URL securityId/lid 走 REST，兜底 hook jobDetail */
async function getCurrentJob(): Promise<Job | null> {
  const url = new URL(location.href)
  const m = extractJobIdFromUrl(location.href)
  if (!m) return null
  const securityId = url.searchParams.get('securityId') ?? ''
  const lid = url.searchParams.get('lid') ?? m
  try {
    if (securityId) {
      const detail = await fetchJobDetail(securityId, lid)
      const job = parseBossJobItem({
        encryptJobId: m,
        securityId,
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
    }
  } catch (e) {
    logger.warn('REST 详情失败，回退 hook：', e)
  }
  // 兜底：hook 到的 jobDetail
  const hooked = await pollHookedJobDetail()
  if (hooked) {
    const detail = hooked.detail as Parameters<typeof mergeBossDetail>[1]
    const job = parseBossJobItem({ encryptJobId: m, securityId: detail.securityId ?? '', jobName: '' })
    return mergeBossDetail(job, detail)
  }
  // 最后兕底：仅返回基础信息（无 JD），由 UI 提示手动刷新
  return parseBossJobItem({ encryptJobId: m, securityId, jobName: '' })
}

async function listVisibleJobs(): Promise<Job[]> {
  try {
    const vue = await getContainerVue(6000)
    const list = readVueData(vue, 'jobList') as BossZpJobItemData[] | undefined
    if (Array.isArray(list)) return list.map(parseBossJobItem)
  } catch (e) {
    logger.warn('jobList hook 失败', e)
  }
  return []
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
