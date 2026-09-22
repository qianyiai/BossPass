import type { ChatMessage } from '@/applications/schema/application'
import type { Job } from '@/jobs/schema/job'
import type { PageInfo, SendGreetingOptions, SendResult } from '@/adapters/types'
import { RUNTIME_RPC } from '@/message/protocol'

/**
 * Side Panel → 当前标签页（content → injected）的 RPC 客户端。
 */

async function getActiveTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) throw new Error('未找到活动标签页')
  return tab.id
}

async function callTab<T>(method: string, payload?: unknown, timeoutMs = 30000): Promise<T> {
  const tabId = await getActiveTabId()
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`RPC 超时: ${method}`)), timeoutMs)
    chrome.tabs.sendMessage(tabId, { type: RUNTIME_RPC, method, payload }, (res) => {
      clearTimeout(timer)
      if (chrome.runtime.lastError) {
        reject(new Error(`无法连接页面脚本，请刷新 BOSS 页面后重试（${chrome.runtime.lastError.message}）`))
        return
      }
      if (!res?.ok) {
        reject(new Error(res?.error ?? 'RPC 失败'))
        return
      }
      resolve(res.data as T)
    })
  })
}

export interface RpcClient {
  getPageInfo(): Promise<PageInfo>
  getCurrentJob(): Promise<Job | null>
  listVisibleJobs(): Promise<Job[]>
  sendGreeting(opts: SendGreetingOptions): Promise<SendResult>
  readChat(): Promise<ChatMessage[]>
  fetchJobDetail(securityId: string, lid: string): Promise<unknown>
  fetchBossData(encryptUserId: string, securityId: string): Promise<unknown>
}

export const rpc: RpcClient = {
  getPageInfo: () => callTab<PageInfo>('page.getInfo', undefined, 8000),
  getCurrentJob: () => callTab<Job | null>('job.getCurrent', undefined, 30000),
  listVisibleJobs: () => callTab<Job[]>('job.listVisible', undefined, 10000),
  sendGreeting: (opts) => callTab<SendResult>('chat.send', { text: opts.text, send: opts.mode === 'confirm-send' }),
  readChat: () => callTab<ChatMessage[]>('chat.read', undefined, 8000),
  fetchJobDetail: (securityId, lid) => callTab('boss.fetchJobDetail', { securityId, lid }),
  fetchBossData: (encryptUserId, securityId) => callTab('boss.fetchBossData', { encryptUserId, securityId }),
}
