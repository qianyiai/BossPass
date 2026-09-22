import * as pdfjs from 'pdfjs-dist'
// 用 ?url 引入 worker，Vite 会把它作为资源打包
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { logger } from '@/utils/logger'

/**
 * PDF 文本提取（第一版只支持 PDF；DOCX 后续加入）。
 * 在 Side Panel（扩展页面）上下文中运行。
 */

let workerReady = false
function ensureWorker() {
  if (workerReady) return
  try {
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
    workerReady = true
  } catch (e) {
    logger.error('pdf worker init failed', e)
  }
}

/** 提取 PDF 文本，尽量按行还原 */
export async function extractTextFromPdf(file: File): Promise<string> {
  ensureWorker()
  const buffer = await file.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise
  const pages: string[] = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    // 按 y 坐标分行、x 排序拼接，尽量保留阅读顺序
    const items = content.items as Array<{ str?: string; transform?: number[]; hasEOL?: boolean }>
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of items) {
      const str = item.str ?? ''
      if (!str) continue
      const y = item.transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(line.trim())
        line = ''
      }
      line += (line && !line.endsWith(' ') && !str.startsWith(' ') ? '' : '') + str
      lastY = y
      if (item.hasEOL) {
        lines.push(line.trim())
        line = ''
        lastY = null
      }
    }
    if (line.trim()) lines.push(line.trim())
    pages.push(lines.filter(Boolean).join('\n'))
  }
  await doc.destroy()
  return pages.join('\n\n')
}

export function isSupportedResumeFile(file: File): boolean {
  return /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
}
