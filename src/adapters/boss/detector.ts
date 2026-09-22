import type { PageKind } from '@/adapters/types'

/** URL/页面探测。detect 返回 kind；selector 探测在注入侧做。 */

export const BOSS_MATCH_RE = /^https?:\/\/(?:[a-z0-9-]+\.)*zhipin\.com\//i

export function matchesBoss(url: string): boolean {
  return BOSS_MATCH_RE.test(url)
}

export function detectBossPageKind(url: string): PageKind {
  const u = new URL(url)
  const p = u.pathname
  if (p.startsWith('/job_detail/')) return 'job-detail'
  if (p.includes('/web/geek/chat')) return 'chat'
  if (p.includes('/web/geek/job-recommend') || p.includes('/web/geek/jobs') || p.includes('/web/geek/recommend')) return 'job-list'
  if (p.includes('/web/geek/search') || p.startsWith('/web/geek/')) return 'search'
  // 首页/城市页（如 /shanghai/?seoRefer=index）也渲染岗位列表
  if (p === '/' || /^\/[a-z]+\/?$/.test(p)) return 'job-list'
  return 'other'
}

/** 从 URL 提取 encryptJobId */
export function extractJobIdFromUrl(url: string): string | null {
  const m = url.match(/\/job_detail\/([0-9a-zA-Z]+)\.html/)
  return m?.[1] ?? null
}
