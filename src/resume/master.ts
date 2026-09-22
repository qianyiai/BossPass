import { parseResumeText } from '@/ai/agents/tasks'
import { randomId } from '@/utils/logger'
import { UserFactProfileSchema, type MasterResume, type Resume } from '@/resume/schema/resume'
import { saveMasterResume } from '@/storage/db'

/**
 * Master Resume 管理：
 * PDF 文本 →（AI 结构化）→ Resume JSON → Master Resume（含事实库）。
 */
export async function createMasterResumeFromText(
  text: string,
  opts?: { resume?: Resume; name?: string },
): Promise<MasterResume> {
  const resume = opts?.resume ?? (await parseResumeText(text))
  const now = Date.now()
  const master: MasterResume = {
    id: randomId('master'),
    resume,
    factProfile: UserFactProfileSchema.parse({
      location: resume.profile.location,
      skills: resume.skills.slice(0, 20),
    }),
    createdAt: now,
    updatedAt: now,
  }
  await saveMasterResume(master)
  return master
}

export function resumeToPlainText(resume: Resume): string {
  const lines: string[] = []
  const p = resume.profile
  lines.push(p.name, [p.email, p.phone, p.location, p.linkedin, p.website].filter(Boolean).join(' | '))
  if (resume.summary) lines.push('', 'SUMMARY', resume.summary)
  if (resume.skills.length) lines.push('', 'SKILLS', resume.skills.join(' · '))
  for (const e of resume.experience) {
    lines.push(
      '',
      `${e.title} — ${e.company} (${e.startDate} ~ ${e.endDate})${e.location ? `, ${e.location}` : ''}`,
    )
    for (const b of e.bullets) lines.push(`- ${b}`)
  }
  for (const pr of resume.projects) {
    lines.push('', `PROJECT: ${pr.name}${pr.role ? ` (${pr.role})` : ''} (${pr.startDate} ~ ${pr.endDate})`)
    for (const b of pr.bullets) lines.push(`- ${b}`)
  }
  for (const ed of resume.education) {
    lines.push('', `${ed.school} — ${ed.degree} ${ed.major} (${ed.startDate} ~ ${ed.endDate})`)
  }
  if (resume.certifications.length) lines.push('', 'CERTIFICATIONS', ...resume.certifications.map((c) => `- ${c}`))
  if (resume.languages.length) lines.push('', 'LANGUAGES', ...resume.languages.map((l) => `- ${l}`))
  return lines.filter((l) => l !== undefined && l !== null).join('\n')
}
