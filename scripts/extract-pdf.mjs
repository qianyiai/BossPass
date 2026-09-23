// 复现插件内 PDF 提取逻辑（pdfjs-dist legacy for Node）
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'

const file = process.argv[2]
if (!file) {
  console.error('usage: node scripts/extract-pdf.mjs <pdf>')
  process.exit(1)
}

const fs = await import('node:fs')
const buffer = fs.readFileSync(file)
const doc = await pdfjs.getDocument({
  data: new Uint8Array(buffer),
  useWorkerFetch: false,
  isEvalSupported: false,
  disableFontFace: true,
}).promise

console.error(`pages: ${doc.numPages}`)

const pages = []
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i)
  const content = await page.getTextContent()
  const items = content.items
  let lastY = null
  let line = ''
  const lines = []
  for (const item of items) {
    const str = item.str ?? ''
    if (!str) continue
    const y = item.transform?.[5] ?? 0
    if (lastY !== null && Math.abs(y - lastY) > 2) {
      lines.push(line.trim())
      line = ''
    }
    line += str
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

const text = pages.join('\n\n')
console.error(`chars: ${text.length}`)
console.error('---- TEXT START ----')
console.log(text)
console.error('---- TEXT END ----')
