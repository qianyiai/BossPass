/**
 * Vue 实例 Hook（BOSS 招聘端是 Vue 2 应用）。
 * 参考 Ocyss/boss-helper useVue.ts 的思路重新实现：
 *  - getRootVue: 轮询 #wrap.__vue__
 *  - hookVueData: Object.defineProperty 覆盖 setter 实现监听
 *  - callVueFn: 取实例方法调用（如 clickJobCardAction）
 * 仅在页面主 world（injected）中运行。
 */

function $(selector: string): Element | null {
  return document.querySelector(selector)
}

async function poll<T>(fn: () => T | null | undefined, intervalMs = 150, timeoutMs = 15000): Promise<T> {
  const start = Date.now()
  for (;;) {
    const v = fn()
    if (v !== null && v !== undefined) return v
    if (Date.now() - start > timeoutMs) throw new Error(`BossPass: 轮询超时`)
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

type Vue2Instance = {
  [key: string]: unknown
  __vue__?: Vue2Instance
}

export async function getRootVue(timeoutMs = 15000): Promise<Vue2Instance> {
  return poll(() => {
    const wrap = $('#wrap') as Vue2Instance | null
    return wrap && '__vue__' in wrap ? (wrap as unknown as { __vue__: Vue2Instance }).__vue__ : null
  }, 300, timeoutMs)
}

/** 容器组件的 __vue__（详情/列表数据挂在这层组件上） */
const CONTAINER_SELECTORS = ['#wrap .page-job-wrapper', '.job-recommend-main', '.page-jobs-main']

export async function getContainerVue(timeoutMs = 15000): Promise<Vue2Instance> {
  return poll(() => {
    for (const sel of CONTAINER_SELECTORS) {
      const el = $(sel) as Vue2Instance | null
      if (el && el.__vue__) return el.__vue__
    }
    return null
  }, 200, timeoutMs)
}

type DataListener = (value: unknown) => void
const hookedKeys = new WeakMap<object, Set<string>>()

/** 监听容器 Vue 组件的 data 字段（覆盖 setter）。返回取消函数。 */
export function hookVueData(vue: Vue2Instance, key: string, listener: DataListener): () => void {
  const descriptor = Object.getOwnPropertyDescriptor(vue, key) ?? Object.getOwnPropertyDescriptor(Object.getPrototypeOf(vue), key)
  const originalSet = descriptor?.set
  const originalGet = descriptor?.get
  let current: unknown = originalGet ? originalGet.call(vue) : (vue[key] as unknown)

  Object.defineProperty(vue, key, {
    configurable: true,
    enumerable: true,
    get() {
      return originalGet ? originalGet.call(vue) : current
    },
    set(val: unknown) {
      current = val
      if (originalSet) originalSet.call(vue, val)
      listener(val)
    },
  })

  let set = hookedKeys.get(vue)
  if (!set) {
    set = new Set()
    hookedKeys.set(vue, set)
  }
  set.add(key)
  return () => {
    Object.defineProperty(vue, key, {
      configurable: true,
      enumerable: true,
      ...(originalGet || originalSet
        ? { get: originalGet, set: originalSet }
        : { value: current, writable: true }),
    })
    set!.delete(key)
  }
}

/** 读取容器组件 data 字段的当前值（不 hook） */
export function readVueData(vue: Vue2Instance, key: string): unknown {
  return vue[key]
}

/** 调用容器组件的方法（如 clickJobCardAction / pageChangeAction） */
export function callVueFn(vue: Vue2Instance, key: string, ...args: unknown[]): unknown {
  const fn = vue[key]
  if (typeof fn === 'function') {
    return (fn as (...a: unknown[]) => unknown).apply(vue, args)
  }
  throw new Error(`BossPass: Vue 方法不存在: ${key}`)
}
