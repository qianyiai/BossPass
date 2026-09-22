import { logger } from '@/utils/logger'
import type { SendResult } from '@/adapters/types'

/**
 * BOSS 消息发送（第一版）：
 * 生成 → 预览 → 用户确认 → 自动填入聊天输入框 → 用户点击发送。
 * 不走 MQTT/Protobuf 私有协议（避免脆弱依赖，见 docs/boss-helper-reference.md §13-14）。
 */

const INPUT_SELECTORS = [
  '.chat-input textarea',
  '#chat-input textarea',
  'textarea.chat-input',
  '.message-input textarea',
  '.chat-conversation textarea',
  'textarea[placeholder*="输入"]',
  'textarea[placeholder*="聊天"]',
  'textarea',
]

const SEND_SELECTORS = [
  '.btn-send',
  '.chat-input .btn-send',
  'button.btn-send',
  '.message-send-btn',
]

export function findChatInput(): HTMLTextAreaElement | HTMLDivElement | null {
  for (const sel of INPUT_SELECTORS) {
    const el = document.querySelector<HTMLTextAreaElement>(sel)
    if (el) return el
  }
  // contenteditable 聊天框
  for (const el of document.querySelectorAll<HTMLDivElement>('[contenteditable="true"]')) {
    const rect = el.getBoundingClientRect()
    if (rect.width > 200 && rect.height > 30) return el
  }
  return null
}

function setNativeValue(el: HTMLTextAreaElement, value: string) {
  const proto = Object.getPrototypeOf(el)
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
  setter?.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function fireVueInput(el: HTMLElement) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'input', bubbles: true }))
}

/** 填入聊天输入框；send=true 时尝试点击发送按钮（仍建议用户在场） */
export async function fillChatInput(text: string, send: boolean): Promise<SendResult> {
  const input = findChatInput()
  if (!input) {
    return { ok: false, via: 'fill-chat-input', message: '未找到聊天输入框，请先打开与该 HR 的会话' }
  }
  if (input instanceof HTMLTextAreaElement) {
    setNativeValue(input, text)
  } else {
    input.textContent = text
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }))
  }
  fireVueInput(input)
  logger.info('已填入聊天输入框', { len: text.length })

  if (!send) {
    return { ok: true, via: 'fill-chat-input', message: '已填入输入框，请检查后点击发送' }
  }
  await new Promise((r) => setTimeout(r, 300))
  for (const sel of SEND_SELECTORS) {
    const btn = document.querySelector<HTMLButtonElement>(sel)
    if (btn && !btn.disabled) {
      btn.click()
      return { ok: true, via: 'fill+click-send', message: '已填入并触发发送' }
    }
  }
  return { ok: true, via: 'fill-chat-input', message: '已填入输入框，未找到发送按钮，请手动点击发送' }
}
