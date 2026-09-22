import type { Job } from '@/jobs/schema/job'
import type { ChatMessage } from '@/applications/schema/application'

/**
 * 平台适配器接口：核心引擎只依赖这个抽象，不依赖任何具体平台。
 * 每个平台（boss/linkedin/seek/...）实现一份放在 adapters/<platform>/。
 */

export type PageKind = 'job-detail' | 'job-list' | 'chat' | 'search' | 'other'

export interface PageInfo {
  platform: string
  pageKind: PageKind
  url: string
  /** 当前页面上的岗位 key（详情页） */
  jobKey?: string
  user?: { id: string; name: string; avatar: string }
}

export interface SendGreetingOptions {
  /** 已确认的最终文本 */
  text: string
  /** 'fill' 只填入输入框由用户点发送；'confirm-send' 填入并尝试触发发送按钮（仍需用户在场确认） */
  mode: 'fill' | 'confirm-send'
}

export interface SendResult {
  ok: boolean
  /** 实际采取的方式，如 fill-chat-input / mqtt */
  via: string
  message?: string
}

export interface PlatformAdapter {
  readonly platform: string
  /** 当前页面是否是本平台 */
  matches(url: string): boolean
  /** 页面信息探测（在页面上下文执行） */
  getPageInfo(ctx: PageContext): Promise<PageInfo>
  /** 获取当前岗位完整数据（详情页：hook + REST；列表页：列表数据） */
  getCurrentJob(ctx: PageContext): Promise<Job | null>
  listVisibleJobs?(ctx: PageContext): Promise<Job[]>
  /** 发送打招呼消息 */
  sendGreeting(ctx: PageContext, opts: SendGreetingOptions): Promise<SendResult>
  /** 读取当前聊天记录（best-effort） */
  readChat(ctx: PageContext): Promise<ChatMessage[]>
}

/**
 * 页面上下文：Adapter 的方法都在其中执行。
 * injected = 页面主 world（能访问 window._PAGE / Vue 实例）
 * isolated = 内容脚本（能访问 chrome.runtime）
 */
export interface PageContext {
  kind: 'injected' | 'isolated'
  /** injected world：直接调用页面能力 */
  injected: InjectedCapabilities
  /** 与注入侧通信（isolated world 用） */
  callInjected<T>(method: string, payload?: unknown): Promise<T>
}

/** 注入侧（页面 world）暴露的能力集 */
export interface InjectedCapabilities {
  getPageInfo(): Promise<PageInfo>
  getCurrentJob(): Promise<Job | null>
  listVisibleJobs(): Promise<Job[]>
  fetchApi(path: string, init?: ApiRequestInit): Promise<unknown>
  fillChatInput(text: string, send: boolean): Promise<SendResult>
  readChat(): Promise<ChatMessage[]>
}

export interface ApiRequestInit {
  method?: string
  body?: BodyInit | Record<string, unknown>
  headers?: Record<string, string>
  timeoutMs?: number
}
