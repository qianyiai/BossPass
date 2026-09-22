import type { ChatMessage } from '@/applications/schema/application'
import { randomId } from '@/utils/logger'

/**
 * BOSS 聊天记录读取（best-effort DOM 提取）。
 * 标注：这是对页面的只读解析，selector 可能随改版失效；
 * 失效时用户可手动粘贴 HR 消息（Side Panel 支持）。
 */

const CHAT_CONTAINER_SELECTORS = [
  '.message-list',
  '.chat-conversation .message-list',
  '#chat-list',
  '.chat-record-list',
]

const MINE_HINTS = ['message-content--mine', 'mine', 'item--mine', 'my-message', 'msg-me']

/** 从当前聊天页面 DOM 读取消息序列 */
export function readChatFromDom(): ChatMessage[] {
  let container: Element | null = null
  for (const sel of CHAT_CONTAINER_SELECTORS) {
    container = document.querySelector(sel)
    if (container) break
  }
  if (!container) return []

  const nodes = Array.from(container.querySelectorAll('.message-item, .message, li[class*="item"]'))
  const out: ChatMessage[] = []
  for (const node of nodes) {
    const textEl = node.querySelector('.message-content, .text, .content, p')
    const content = (textEl?.textContent ?? node.textContent ?? '').trim()
    if (!content || content.length > 2000) continue
    const cls = node.className ?? ''
    const isMine = MINE_HINTS.some((h) => String(cls).toLowerCase().includes(h))
    out.push({
      id: randomId('msg'),
      role: isMine ? 'me' : 'hr',
      content,
      time: 0,
    })
  }
  // 去重相邻重复
  return out.filter((m, i, arr) => i === 0 || m.content !== arr[i - 1]?.content)
}
