import type { ChatMessage } from '@/applications/schema/application'
import type { Job } from '@/jobs/schema/job'
import type { PageInfo, PlatformAdapter, PageContext, SendGreetingOptions, SendResult } from '@/adapters/types'
import { matchesBoss } from './detector'

/**
 * BOSS Adapter（Side Panel 侧实现）。
 * 所有页面能力通过 RPC 转发到 content → injected(页面 world)。
 * BossPass 核心引擎只依赖 PlatformAdapter 抽象。
 */
export const bossAdapter: PlatformAdapter = {
  platform: 'boss',

  matches(url) {
    return matchesBoss(url)
  },

  async getPageInfo(ctx: PageContext): Promise<PageInfo> {
    return ctx.callInjected<PageInfo>('page.getInfo')
  },

  async getCurrentJob(ctx: PageContext): Promise<Job | null> {
    return ctx.callInjected<Job | null>('job.getCurrent')
  },

  async listVisibleJobs(ctx: PageContext): Promise<Job[]> {
    return ctx.callInjected<Job[]>('job.listVisible')
  },

  async sendGreeting(ctx: PageContext, opts: SendGreetingOptions): Promise<SendResult> {
    return ctx.callInjected<SendResult>('chat.send', { text: opts.text, send: opts.mode === 'confirm-send' })
  },

  async readChat(ctx: PageContext): Promise<ChatMessage[]> {
    return ctx.callInjected<ChatMessage[]>('chat.read')
  },
}
