import { defineBackground } from '#imports'

/**
 * Background service worker：
 * - 点击扩展图标打开 Side Panel
 * - 转发 page-changed 事件给 Side Panel（如有）
 */
export default defineBackground(() => {
  void chrome.sidePanel
    ?.setPanelBehavior?.({ openPanelOnActionClick: true })
    .catch((e: unknown) => console.warn('[BossPass] setPanelBehavior failed', e))

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'bosspass:page-changed') {
      // 广播给 sidepanel（无接收方时静默）
      void chrome.runtime.sendMessage(msg).catch(() => {})
    }
    return undefined
  })
})
