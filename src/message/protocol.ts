/**
 * BossPass 内部消息协议
 * - sidepanel/background ↔ content(ISOLATED)：browser.runtime messaging
 * - content ↔ injected(页面 world)：CustomEvent + JSON
 */

export const BRIDGE_CALL_EVENT = 'bosspass:call'
export const BRIDGE_RESULT_EVENT = 'bosspass:call-result'
export const PAGE_CHANGED_EVENT = 'bosspass:page-changed'

export const RUNTIME_RPC = 'bosspass:rpc'

export interface BridgeCall {
  id: string
  method: string
  payload?: unknown
}

export interface BridgeResult {
  id: string
  ok: boolean
  data?: unknown
  error?: string
}

export const RPC_METHODS = {
  getPageInfo: 'page.getInfo',
  getCurrentJob: 'job.getCurrent',
  listVisibleJobs: 'job.listVisible',
  sendGreeting: 'chat.send',
  readChat: 'chat.read',
} as const

export interface PageChangedPayload {
  url: string
}
