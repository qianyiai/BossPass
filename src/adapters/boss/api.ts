import { logger } from '@/utils/logger'
import type { BossPageGlobals, BossZpBossData, BossZpDetailData } from './types'

/**
 * BOSS wapi REST 调用（在页面主 world 执行，自动带 cookie 与 referrer）。
 * 参考 Ocyss/boss-helper requests.ts 已验证的接口与鉴权方式。
 */

export const ZHIPIN_ORIGIN = 'https://www.zhipin.com'

function pageGlobals(): BossPageGlobals {
  return window as unknown as BossPageGlobals
}

/** Zp_token（页面 Cookie.get('bst')），拿不到时返回空（接口可能仍可用） */
export function getZpToken(): string {
  try {
    const t = pageGlobals().Cookie?.get?.('bst')
    if (t) return t
  } catch {
    /* ignore */
  }
  // 兜底：document.cookie 直接解析
  const m = document.cookie.match(/(?:^|;\s*)bst=([^;]+)/)
  return m?.[1] ?? ''
}

export function getUserInfo(): { id: string; name: string; avatar: string } {
  const p = pageGlobals()._PAGE ?? {}
  return {
    id: p.encryptUserId ?? String(p.userId ?? p.uid ?? ''),
    name: p.showName ?? p.name ?? '',
    avatar: p.largeAvatar ?? p.tinyAvatar ?? '',
  }
}

export async function wapiFetch<T>(
  path: string,
  init: { method?: string; body?: BodyInit | Record<string, unknown>; headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<T> {
  const url = path.startsWith('http') ? path : `${ZHIPIN_ORIGIN}${path}`
  const headers: Record<string, string> = {
    'Zp_token': getZpToken(),
    ...init.headers,
  }
  let body = init.body
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(typeof body === 'string')) {
    // wapi 大多接受 query/form；默认 JSON 由具体调用方决定，这里统一 FormData/URLSearchParams 由调用方传
    body = JSON.stringify(body)
    headers['Content-Type'] = 'application/json'
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? 10000)
  try {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers,
      body: body as BodyInit | undefined,
      credentials: 'include',
      signal: controller.signal,
    })
    return (await res.json()) as T
  } finally {
    clearTimeout(timer)
  }
}

export interface WapiResp<T> {
  code: number
  message: string
  zpData: T
}

/** 岗位完整详情 */
export async function fetchJobDetail(securityId: string, lid: string): Promise<BossZpDetailData> {
  const resp = await wapiFetch<WapiResp<BossZpDetailData>>(
    `/wapi/zpgeek/job/detail.json?securityId=${encodeURIComponent(securityId)}&lid=${encodeURIComponent(lid)}&_=${Date.now()}`,
  )
  if (resp.code !== 0) throw new Error(`获取岗位详情失败: ${resp.message}`)
  return resp.zpData
}

/** HR 数据（发送消息前需要 bossId） */
export async function fetchBossData(encryptUserId: string, securityId: string): Promise<BossZpBossData> {
  const form = new FormData()
  form.append('bossId', encryptUserId)
  form.append('securityId', securityId)
  form.append('bossSrc', '0')
  const resp = await wapiFetch<WapiResp<BossZpBossData>>(`/wapi/zpchat/geek/getBossData`, {
    method: 'POST',
    body: form,
  })
  if (resp.code !== 0) {
    logger.warn('getBossData 非好友或失败:', resp.message)
  }
  return resp.zpData
}

export class BossLimitError extends Error {}
export class BossRateLimitError extends Error {}

/** 加好友/打招呼（=BOSS 语义里的"立即沟通"投递） */
export async function sendFriendAdd(securityId: string, encryptJobId: string): Promise<WapiResp<Record<string, unknown>>> {
  const resp = await wapiFetch<WapiResp<Record<string, unknown>>>(
    `/wapi/zpgeek/friend/add.json?securityId=${encodeURIComponent(securityId)}&jobId=${encodeURIComponent(encryptJobId)}`,
    { method: 'POST' },
  )
  if (resp.code === 1) {
    const content = String((resp as { zpData?: { bizData?: { chatRemindDialog?: { content?: string } } } }).zpData?.bizData?.chatRemindDialog?.content || resp.message || '未知错误')
    if (content.includes('沟通') && (content.includes('120') || content.includes('150'))) throw new BossLimitError(content)
    if (content.includes('操作过于频繁')) throw new BossRateLimitError(content)
    throw new Error(content)
  }
  if (resp.code !== 0) throw new Error(`打招呼失败: ${resp.message}`)
  return resp
}
