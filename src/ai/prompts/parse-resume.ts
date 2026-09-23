import { ResumeSchema, type Resume } from '@/resume/schema/resume'
import { z } from 'zod'

/** 导出的 Schema 供 agent 使用 */
export const ParsedResumeSchema = ResumeSchema

const OUTPUT_SKELETON = `{
  "profile": { "name": "", "email": "", "phone": "", "location": "", "linkedin": "", "website": "" },
  "summary": "",
  "skills": [],
  "experience": [
    { "company": "", "title": "", "startDate": "", "endDate": "", "location": "", "bullets": ["", ""] }
  ],
  "projects": [
    { "name": "", "role": "", "startDate": "", "endDate": "", "url": "", "bullets": ["", ""] }
  ],
  "education": [
    { "school": "", "degree": "", "major": "", "startDate": "", "endDate": "" }
  ],
  "certifications": [],
  "languages": []
}`

const SYSTEM = `你是简历解析引擎。把从 PDF/DOCX 提取的纯文本还原为结构化简历 JSON。
【输出结构——必须严格符合，所有键都必须存在，无内容用 "" 或 []，禁止改键名、禁止增删顶层键】
${OUTPUT_SKELETON}

规则：
1. 严格保留原文中的事实（公司/职位/时间/成果数字），不要改写润色、不要翻译、不要补全缺失字段。
2. 文本可能乱序或粘连，按常见简历结构（个人信息/摘要/技能/工作经历/项目/教育/证书/语言）合理归位。
3. 时间统一为原文格式原样保留。
4. bullets 是字符串数组；整段职责描述可拆成多条。
5. 只输出 JSON 本体，不要 markdown 代码块，不要解释。`

export function buildParseResumePrompt(resumeText: string): { system: string; user: string } {
  const user = `<简历原文>
${resumeText.slice(0, 30000)}
</简历原文>`
  return { system: SYSTEM, user }
}

// ---------- 宽松归一化：模型键名五花八门时映射回标准结构 ----------

type AnyObj = Record<string, unknown>

function asObj(v: unknown): AnyObj | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as AnyObj) : null
}

function pick(obj: AnyObj, keys: string[]): unknown {
  for (const k of keys) {
    const v = obj[k]
    if (v !== undefined && v !== null && v !== '') return v
  }
  return undefined
}

function toStrArray(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (typeof x === 'string') return x.trim()
        const o = asObj(x)
        if (o) {
          const t = pick(o, ['text', 'content', 'description', 'desc', '描述', '内容', 'name', 'title'])
          return typeof t === 'string' ? t.trim() : ''
        }
        return String(x ?? '').trim()
      })
      .filter(Boolean)
  }
  if (typeof v === 'string') {
    return v
      .split(/[\n;；]/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
  return []
}

function normalizeProfile(v: unknown) {
  const o = asObj(v) ?? {}
  return {
    name: String(pick(o, ['name', '姓名', '名字', 'fullName']) ?? ''),
    email: String(pick(o, ['email', '邮箱', '电子邮件', 'mail']) ?? ''),
    phone: String(pick(o, ['phone', '电话', '手机', '手机号', 'tel', 'mobile']) ?? ''),
    location: String(pick(o, ['location', '地点', '所在地', '城市', 'city', 'address', '地址']) ?? ''),
    linkedin: String(pick(o, ['linkedin', 'LinkedIn', '领英']) ?? ''),
    website: String(pick(o, ['website', '网站', '主页', 'blog', '博客', 'homepage', 'url']) ?? ''),
  }
}

function normalizeExperienceList(v: unknown) {
  const list = Array.isArray(v) ? v : []
  return list.map((item) => {
    const o = asObj(item) ?? {}
    return {
      company: String(pick(o, ['company', 'companyName', '公司', '公司名称', 'employer']) ?? ''),
      title: String(pick(o, ['title', 'position', 'jobTitle', '职位', '岗位', '职务']) ?? ''),
      startDate: String(pick(o, ['startDate', 'start', '开始时间', '入职时间', 'from']) ?? ''),
      endDate: String(pick(o, ['endDate', 'end', '结束时间', '离职时间', 'to']) ?? ''),
      location: String(pick(o, ['location', '地点', '城市', '地址']) ?? ''),
      bullets: toStrArray(
        pick(o, ['bullets', 'bullet', 'description', 'desc', '工作内容', '描述', '内容', '职责', 'highlights', 'achievements']),
      ),
    }
  })
}

function normalizeProjectList(v: unknown) {
  const list = Array.isArray(v) ? v : []
  return list.map((item) => {
    const o = asObj(item) ?? {}
    return {
      name: String(pick(o, ['name', 'projectName', '项目名', '项目名称', 'title']) ?? ''),
      role: String(pick(o, ['role', '角色', '职责', 'myRole']) ?? ''),
      startDate: String(pick(o, ['startDate', 'start', '开始时间', 'from']) ?? ''),
      endDate: String(pick(o, ['endDate', 'end', '结束时间', 'to']) ?? ''),
      url: String(pick(o, ['url', 'link', '链接']) ?? ''),
      bullets: toStrArray(pick(o, ['bullets', 'description', 'desc', '描述', '内容', '成果', 'performance', 'highlights'])),
    }
  })
}

function normalizeEducationList(v: unknown) {
  const list = Array.isArray(v) ? v : []
  return list.map((item) => {
    const o = asObj(item) ?? {}
    return {
      school: String(pick(o, ['school', 'schoolName', '学校', '大学', 'university']) ?? ''),
      degree: String(pick(o, ['degree', '学历', '学位']) ?? ''),
      major: String(pick(o, ['major', '专业', '专业名称']) ?? ''),
      startDate: String(pick(o, ['startDate', 'start', '开始时间', 'from']) ?? ''),
      endDate: String(pick(o, ['endDate', 'end', '结束时间', 'to']) ?? ''),
    }
  })
}

/** 把模型输出的"长得像简历"的对象归一化为标准 Resume（容忍中英文/别名键、缺键） */
export function normalizeParsedResume(raw: unknown): Resume {
  let obj = asObj(raw)
  if (!obj && Array.isArray(raw)) {
    obj = asObj(raw.find((x) => asObj(x) !== null))
  }
  if (!obj) throw new Error('AI 输出不是 JSON 对象')

  // 解包常见包装层 { resume: {...} } / { data: {...} }
  for (const wrap of ['resume', 'data', 'result', 'output', '简历']) {
    const inner = asObj(obj[wrap])
    if (
      inner &&
      (inner['profile'] !== undefined || inner['experience'] !== undefined || inner['skills'] !== undefined)
    ) {
      obj = inner
      break
    }
  }

  return ResumeSchema.parse({
    profile: normalizeProfile(
      pick(obj, ['profile', 'basics', 'basic', 'personal', '个人信息', '基本信息', 'contacts', 'contact']),
    ),
    summary: String(pick(obj, ['summary', '个人简介', '自我评价', '个人总结', 'about']) ?? ''),
    skills: toStrArray(pick(obj, ['skills', '技能', '专业技能', 'skill', '技术栈', 'techStack']) ?? []),
    experience: normalizeExperienceList(
      pick(obj, ['experience', 'workExperience', 'work', 'employment', '工作经历', '经历', 'works']),
    ),
    projects: normalizeProjectList(pick(obj, ['projects', 'project', '项目经历', '项目'])),
    education: normalizeEducationList(pick(obj, ['education', 'educations', '教育经历', '教育', '学历'])),
    certifications: toStrArray(pick(obj, ['certifications', 'certificates', '证书', 'certification', 'credentials']) ?? []),
    languages: toStrArray(pick(obj, ['languages', '语言', '语言能力']) ?? []),
  })
}

/** 供宽松路径使用的 unknown schema */
export const LooseJsonSchema = z.unknown()

