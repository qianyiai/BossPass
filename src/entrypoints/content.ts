import { defineContentScript, injectScript } from '#imports'
import {
  BRIDGE_CALL_EVENT,
  BRIDGE_RESULT_EVENT,
  PAGE_CHANGED_EVENT,
  RUNTIME_RPC,
  type BridgeCall,
  type BridgeResult,
} from '@/message/protocol'
import { logger } from '@/utils/logger'

/**
 * Content Script（ISOLATED world）：
 * 1. 注入 injected.js 到页面 world
 * 2. CustomEvent 双向桥（content ↔ injected）
 * 3. runtime 消息服务（sidepanel/background ↔ content）
 */

export default defineContentScript({
  matches: ['*://zhipin.com/*', '*://*.zhipin.com/*'],
  runAt: 'document_start',
  async main() {
    logger.info('content 启动')

    await injectScript('/injected.js', { keepInDom: true })

    const pending = new Map<string, (r: BridgeResult) => void>()

    window.addEventListener(BRIDGE_RESULT_EVENT, (e) => {
      try {
        const result = JSON.parse((e as CustomEvent<string>).detail) as BridgeResult
        pending.get(result.id)?.(result)
        pending.delete(result.id)
      } catch {
        /* ignore */
      }
    })

    /** 注入侧调用（ISOLATED 里通过 CustomEvent 转发） */
    async function callInjected<T>(method: string, payload?: unknown, timeoutMs = 20000): Promise<T> {
      const call: BridgeCall = { id: `cs_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, method, payload }
      const p = new Promise<BridgeResult>((resolve, reject) => {
        pending.set(call.id, resolve)
        setTimeout(() => {
          if (pending.has(call.id)) {
            pending.delete(call.id)
            reject(new Error(`调用注入侧超时: ${method}`))
          }
        }, timeoutMs)
      })
      window.dispatchEvent(new CustomEvent(BRIDGE_CALL_EVENT, { detail: JSON.stringify(call) }))
      const result = await p
      if (!result.ok) throw new Error(result.error ?? '注入侧执行失败')
      return result.data as T
    }

    // sidepanel/background → content RPC
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (msg?.type !== RUNTIME_RPC) return undefined
      const { method, payload } = msg as { method: string; payload?: unknown }
      callInjected(method, payload)
        .then((data) => sendResponse({ ok: true, data }))
        .catch((e: unknown) => sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) }))
      return true // async response
    })

    // 页面路由变化 → 转发给扩展（sidepanel 打开时会收到）
    window.addEventListener(PAGE_CHANGED_EVENT, (e) => {
      try {
        const { url } = JSON.parse((e as CustomEvent<string>).detail) as { url: string }
        void chrome.runtime.sendMessage({ type: 'bosspass:page-changed', url }).catch(() => {})
      } catch {
        /* ignore */
      }
    })
  },
})
