import type { Resume } from '@/resume/schema/resume'
import { resumeToPlainText } from '@/resume/master'

/**
 * PDF 导出（第一版：1 个 ATS Friendly 模板）。
 * Resume JSON → ATS HTML → 系统打印对话框"另存为 PDF"。
 */

const ATS_CSS = `
  @page { margin: 14mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, "Microsoft YaHei", "PingFang SC", sans-serif; color: #111; font-size: 12px; line-height: 1.5; max-width: 820px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: .5px; }
  .contact { color: #333; margin-bottom: 10px; font-size: 12px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #999; padding-bottom: 2px; margin: 14px 0 6px; }
  .item-head { display: flex; justify-content: space-between; font-weight: 700; }
  .item-sub { color: #444; font-size: 11.5px; margin-bottom: 2px; }
  ul { margin: 2px 0 8px 18px; padding: 0; }
  li { margin: 1px 0; }
  p { margin: 4px 0; }
`

export function renderResumeHTML(resume: Resume): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const p = resume.profile
  const contact = [p.email, p.phone, p.location, p.linkedin, p.website].filter(Boolean).map(esc).join('  |  ')
  const section = (title: string, inner: string) =>
    inner ? `<h2>${esc(title)}</h2>${inner}` : ''

  const expHtml = resume.experience
    .map(
      (e) => `<div class="item">
      <div class="item-head"><span>${esc(e.title)}</span><span>${esc(e.startDate)} ~ ${esc(e.endDate)}</span></div>
      <div class="item-sub">${esc([e.company, e.location].filter(Boolean).join('，'))}</div>
      ${e.bullets.length ? `<ul>${e.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    </div>`,
    )
    .join('')

  const projHtml = resume.projects
    .map(
      (pr) => `<div class="item">
      <div class="item-head"><span>${esc(pr.name)}${pr.role ? ` — ${esc(pr.role)}` : ''}</span><span>${esc(pr.startDate)} ~ ${esc(pr.endDate)}</span></div>
      ${pr.bullets.length ? `<ul>${pr.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>` : ''}
    </div>`,
    )
    .join('')

  const eduHtml = resume.education
    .map(
      (ed) => `<div class="item">
      <div class="item-head"><span>${esc(ed.school)}</span><span>${esc(ed.startDate)} ~ ${esc(ed.endDate)}</span></div>
      <div class="item-sub">${esc([ed.degree, ed.major].filter(Boolean).join(' · '))}</div>
    </div>`,
    )
    .join('')

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${esc(p.name)} - Resume</title><style>${ATS_CSS}</style></head>
<body>
  <h1>${esc(p.name)}</h1>
  <div class="contact">${contact}</div>
  ${section('Summary', resume.summary ? `<p>${esc(resume.summary)}</p>` : '')}
  ${section('Skills', resume.skills.length ? `<p>${esc(resume.skills.join('  ·  '))}</p>` : '')}
  ${section('Experience', expHtml)}
  ${section('Projects', projHtml)}
  ${section('Education', eduHtml)}
  ${section('Certifications', resume.certifications.length ? `<ul>${resume.certifications.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '')}
  ${section('Languages', resume.languages.length ? `<p>${esc(resume.languages.join('  ·  '))}</p>` : '')}
</body></html>`
}

/** 打开新窗口并唤起打印（用户选择"另存为 PDF"） */
export function exportResumePdf(resume: Resume): void {
  const html = renderResumeHTML(resume)
  const w = window.open('', '_blank', 'width=900,height=1000')
  if (!w) throw new Error('弹窗被拦截，请允许弹窗后重试')
  w.document.write(html)
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 400)
}

/** 纯文本导出（ATS 粘贴用） */
export function resumePlainText(resume: Resume): string {
  return resumeToPlainText(resume)
}
