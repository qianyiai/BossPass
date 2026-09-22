/**
 * BOSS 直聘原始数据类型（字段来源：对 zhipin.com wapi/页面数据的观察，
 * 参考 Ocyss/boss-helper 的类型定义重新整理。只保留 BossPass 用到的字段。）
 */

/** 列表页/推荐页 hook 到的岗位条目 */
export interface BossZpJobItemData {
  securityId: string
  encryptJobId: string
  encryptBrandId?: string
  encryptBossId?: string
  lid?: string
  jobName: string
  salaryDesc?: string
  jobLabels?: string[]
  skills?: string[]
  jobExperience?: string
  jobDegree?: string
  cityName?: string
  areaDistrict?: string
  businessDistrict?: string
  brandName?: string
  brandLogo?: string
  brandIndustry?: string
  brandScaleName?: string
  brandStageName?: string
  welfareList?: string[]
  contact?: boolean
  goldHunter?: number
  bossName?: string
  bossTitle?: string
  bossAvatar?: string
  bossOnline?: boolean
  lastModifyTime?: number
  gps?: { longitude: number; latitude: number }
}

/** job/detail.json 返回的详情 */
export interface BossZpDetailData {
  securityId?: string
  lid?: string
  jobInfo?: {
    encryptId?: string
    encryptUserId?: string
    jobName?: string
    positionName?: string
    postDescription?: string
    locationName?: string
    address?: string
    longitude?: number
    latitude?: number
    experienceName?: string
    degreeName?: string
    salaryDesc?: string
    showSkills?: string[]
    welfareList?: string[]
  }
  bossInfo?: {
    name?: string
    title?: string
    brandName?: string
    encryptBossId?: string
    bossId?: number
    bossSource?: number
    certificated?: boolean
    bossOnline?: boolean
    activeTimeDesc?: string
  }
  brandComInfo?: {
    encryptBrandId?: string
    brandName?: string
    logo?: string
    stageName?: string
    scaleName?: string
    industryName?: string
    introduce?: string
    labels?: Array<{ labelName?: string } | string>
    activeTime?: number
  }
}

/** zpchat/geek/getBossData 返回 */
export interface BossZpBossData {
  data?: {
    bossId?: number
    encryptBossId?: string
    name?: string
    title?: string
    companyName?: string
    bothTalked?: boolean
    securityId?: string
  }
  job?: {
    jobName?: string
    salaryDesc?: string
    brandName?: string
  }
}

/** 页面全局对象（page world 可见） */
export interface BossPageGlobals {
  _PAGE?: {
    encryptUserId?: string
    userId?: number
    uid?: number
    token?: string
    showName?: string
    name?: string
    largeAvatar?: string
    tinyAvatar?: string
  }
  Cookie?: { get(key: string): string | undefined }
}
