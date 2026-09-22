import type { ResumeChange } from '@/applications/schema/application'
import type { Resume } from '@/resume/schema/resume'

/**
 * 简历 Diff：AI 输出 changes（path/before/after/reason），
 * 用户逐条接受/拒绝后应用到副本 → 生成 Resume Version。Master 永不覆盖。
 */

/** 按路径把变更应用到简历副本。路径形如 summary / skills / experience[0].bullets[1] */
export function applyChange(resume: Resume, change: ResumeChange): Resume {
  const next: Resume = structuredClone(resume)
  const tokens = change.path.split('.')
  // 定位容器与最后一级
  let container: unknown = next
  const key = tokens[tokens.length - 1] ?? ''
  for (const t of tokens.slice(0, -1)) {
    const m = t.match(/^(\w+)\[(\d+)\]$/)
    if (m) {
      container = (container as Record<string, unknown>)[m[1] ?? '']
      container = (container as unknown[])[Number(m[2])]
    } else {
      container = (container as Record<string, unknown>)[t]
    }
  }
  const last = key.match(/^(\w+)\[(\d+)\]$/)
  if (last) {
    const arr = (container as Record<string, unknown>)[last[1]] as unknown[]
    arr[Number(last[2])] = change.after
  } else if (key === 'skills' && change.path === 'skills') {
    // 整组技能替换
    const beforeItems = change.before.split(/[,，、\n]/).map((s: string) => s.trim()).filter(Boolean)
    const afterItems = change.after.split(/[,，、\n]/).map((s: string) => s.trim()).filter(Boolean)
    void beforeItems
    next.skills = afterItems
  } else {
    ;(container as Record<string, unknown>)[key] = change.after
  }
  return next
}

export function applyChanges(
  resume: Resume,
  changes: ResumeChange[],
  acceptedPredicate: (c: ResumeChange) => boolean = (c) => c.status === 'accepted',
): Resume {
  let current = structuredClone(resume)
  for (const c of changes) {
    if (acceptedPredicate(c)) {
      try {
        current = applyChange(current, c)
      } catch (e) {
        console.warn('[BossPass] applyChange failed', c.path, e)
      }
    }
  }
  return current
}

/** 生成简化版差异预览：找出两个简历对象的文本字段差异 */
export function diffResumes(before: Resume, after: Resume): ResumeChange[] {
  const changes: ResumeChange[] = []
  if (before.summary !== after.summary) {
    changes.push({ path: 'summary', label: 'Summary', before: before.summary, after: after.summary, reason: '', status: 'accepted' })
  }
  const skillsB = before.skills.join('、')
  const skillsA = after.skills.join('、')
  if (skillsB !== skillsA) {
    changes.push({ path: 'skills', label: 'Skills', before: skillsB, after: skillsA, reason: '', status: 'accepted' })
  }
  before.experience.forEach((exp, i) => {
    const target = after.experience[i]
    if (!target) return
    exp.bullets.forEach((b, j) => {
      const nb = target.bullets[j]
      if (nb !== undefined && nb !== b) {
        changes.push({
          path: `experience[${i}].bullets[${j}]`,
          label: `${exp.title}@${exp.company} · 条目 ${j + 1}`,
          before: b,
          after: nb,
          reason: '',
          status: 'accepted',
        })
      }
    })
  })
  return changes
}
