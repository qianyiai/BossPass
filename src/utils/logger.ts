let verbose = true

export const logger = {
  debug(...args: unknown[]) {
    if (verbose) console.debug('[BossPass]', ...args)
  },
  info(...args: unknown[]) {
    console.info('[BossPass]', ...args)
  },
  warn(...args: unknown[]) {
    console.warn('[BossPass]', ...args)
  },
  error(...args: unknown[]) {
    console.error('[BossPass]', ...args)
  },
}

export function randomId(prefix = ''): string {
  const core =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
  return prefix ? `${prefix}_${core}` : core
}
