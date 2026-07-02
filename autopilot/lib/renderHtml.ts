import * as fs from 'fs'
import * as path from 'path'

const TEMPLATES_HTML_DIR = path.join(__dirname, '..', 'templates-html')

function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export async function renderHtmlTemplate(
  templateName: string,
  fields: Record<string, string>,
  options: { width?: number; height?: number } = {}
): Promise<Buffer> {
  const { width = 1080, height = 1080 } = options

  const templatePath = path.join(TEMPLATES_HTML_DIR, `${templateName}.html`)
  let html = fs.readFileSync(templatePath, 'utf-8')

  for (const [key, value] of Object.entries(fields)) {
    html = html.replaceAll(`{{${key}}}`, escapeHtml(value))
  }

  // Dynamic import handles puppeteer v22+ (pure ESM) from a CommonJS module
  const puppeteer = await import('puppeteer')
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 1 })
    await page.setContent(html, { waitUntil: 'load' })
    const buffer = await page.screenshot({ type: 'png' })
    return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer as Uint8Array)
  } finally {
    await browser.close()
  }
}
