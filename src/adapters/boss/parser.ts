import { JobSchema, splitDescriptionBlocks, type Job } from '@/jobs/schema/job'
import type { BossZpDetailData, BossZpJobItemData } from './types'

/** boss::encryptJobId */
export function bossJobKey(encryptJobId: string): string {
  return `boss::${encryptJobId}`
}

export function bossJobUrl(encryptJobId: string): string {
  return `https://www.zhipin.com/job_detail/${encryptJobId}.html`
}

/** 列表条目 → 统一 Job（无完整 JD，description 为空待详情补充） */
export function parseBossJobItem(item: BossZpJobItemData): Job {
  return JobSchema.parse({
    platform: 'boss',
    jobId: item.encryptJobId ?? '',
    key: bossJobKey(item.encryptJobId ?? ''),
    url: bossJobUrl(item.encryptJobId ?? ''),
    title: item.jobName ?? '',
    company: {
      name: item.brandName ?? '',
      logo: item.brandLogo ?? '',
      industry: item.brandIndustry ?? '',
      scale: item.brandScaleName ?? '',
      stage: item.brandStageName ?? '',
      platformCompanyId: item.encryptBrandId ?? '',
    },
    skills: item.skills ?? [],
    experienceRequirement: item.jobExperience ?? item.jobLabels?.[0] ?? '',
    educationRequirement: item.jobDegree ?? '',
    salary: item.salaryDesc ?? '',
    location: [item.cityName, item.areaDistrict, item.businessDistrict].filter(Boolean).join('-'),
    benefits: item.welfareList ?? [],
    labels: item.jobLabels ?? [],
    hr: {
      name: item.bossName ?? '',
      title: item.bossTitle ?? '',
      platformUserId: item.encryptBossId ?? '',
      online: item.bossOnline ?? false,
    },
    contacted: item.contact ?? false,
    securityId: item.securityId ?? '',
    lid: item.lid ?? '',
    fetchedAt: Date.now(),
  })
}

/** 详情数据合并进 Job：完整 JD、HR/公司信息补全 */
export function mergeBossDetail(job: Job, detail: BossZpDetailData): Job {
  const j = detail.jobInfo ?? {}
  const b = detail.bossInfo ?? {}
  const brand = detail.brandComInfo ?? {}
  const description = j.postDescription ?? job.description
  const { responsibilities, requirements } = splitDescriptionBlocks(description)
  return JobSchema.parse({
    ...job,
    description,
    responsibilities: responsibilities.length ? responsibilities : job.responsibilities,
    requirements: requirements.length ? requirements : job.requirements,
    skills: j.showSkills?.length ? j.showSkills : job.skills,
    experienceRequirement: j.experienceName || job.experienceRequirement,
    educationRequirement: j.degreeName || job.educationRequirement,
    salary: j.salaryDesc || job.salary,
    location: [j.locationName, j.address].filter(Boolean).join('-') || job.location,
    benefits: j.welfareList?.length ? j.welfareList : job.benefits,
    company: {
      ...job.company,
      name: brand.brandName || job.company.name,
      logo: brand.logo || job.company.logo,
      stage: brand.stageName || job.company.stage,
      scale: brand.scaleName || job.company.scale,
      industry: brand.industryName || job.company.industry,
      introduce: brand.introduce || job.company.introduce,
    },
    hr: {
      ...job.hr,
      name: b.name || job.hr.name,
      title: b.title || job.hr.title,
      platformUserId: b.encryptBossId || job.hr.platformUserId,
      platformUid: b.bossId != null ? String(b.bossId) : job.hr.platformUid,
      online: b.bossOnline ?? job.hr.online,
      activeDesc: b.activeTimeDesc ?? job.hr.activeDesc,
    },
    fetchedAt: Date.now(),
  })
}
