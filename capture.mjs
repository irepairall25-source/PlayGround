import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const runtime = process.env.OMGITHUB_PLAYWRIGHT_ROOT || join(process.env.HOME, '.local/share/omgithub-playwright')
const require = createRequire(join(runtime, 'package.json'))
const { chromium } = require('playwright')
try {
  const captures = require(join(runtime, 'wip-screenshots.cjs'))
  captures.instrument({ chromium })
} catch {
  // Evidence queueing is optional; direct screenshots remain authoritative.
}

const configPath = join(runtime, process.platform === 'darwin' ? 'metal.json' : 'linux.json')
const config = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) : { browser: { launchOptions: {} } }
if (process.platform === 'linux' && !process.env.DISPLAY && existsSync(join(runtime, 'display'))) {
  process.env.DISPLAY = ':' + readFileSync(join(runtime, 'display'), 'utf8').trim()
}

const url = process.env.CAPTURE_URL
const output = process.env.CAPTURE_DIR
if (!url || !output) {
  console.error('Set CAPTURE_URL and CAPTURE_DIR.')
  process.exit(1)
}
mkdirSync(output, { recursive: true })

const transientPatterns = [
  /net::ERR_/i,
  /ECONNREFUSED/i,
  /ECONNRESET/i,
  /ENOTFOUND/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /Target (page|browser).*closed/i,
  /browser has disconnected/i,
  /Navigation timeout/i,
  /Timeout .*exceeded/i
]
function exitCodeFor(error) {
  if (error?.exitCode) return error.exitCode
  const message = String(error?.message || error)
  if (error?.name === 'TimeoutError' || transientPatterns.some(pattern => pattern.test(message))) return 75
  return 1
}
function transient(error) {
  throw Object.assign(error, { exitCode: 75 })
}

const launchOptions = {
  ...config.browser?.launchOptions,
  timeout: 30000,
  headless: process.platform === 'linux' ? !process.env.DISPLAY : false
}

let browser
let pageErrors = []
let failure = null
try {
  browser = await chromium.launch(launchOptions).catch(transient)

  for (const [name, width, height] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
    let page
    try {
      page = await browser.newPage({ viewport: { width, height } }).catch(transient)
      page.setDefaultTimeout(30000)
      page.setDefaultNavigationTimeout(45000)
      page.on('pageerror', error => {
        pageErrors.push(`${name}: ${error.message}`)
        console.error(`Page error (${name}): ${error.message}`)
      })
      page.on('console', message => {
        if (message.type() === 'error') console.error(`Console error (${name}): ${message.text()}`)
      })

      const response = await page.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(transient)
      if (!response?.ok()) {
        const status = response?.status()
        throw Object.assign(new Error(`HTTP ${status ?? 'unavailable'} loading ${url}`), {
          exitCode: !response || [408, 429, 500, 502, 503, 504].includes(status) ? 75 : 1
        })
      }

      await page.locator('html[data-app-ready="true"]').waitFor({ state: 'attached', timeout: 20000 })
      await page.waitForFunction(() => document.fonts.status === 'loaded', null, { timeout: 15000 })
      await page.waitForFunction(() => window.__XFINITY_CAM_READY__ === true, null, { timeout: 20000 })
      await page.locator('#mainCanvas').waitFor({ state: 'visible', timeout: 15000 })
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {})
      await page.waitForTimeout(900)

      const render = await page.evaluate(() => {
        const canvas = document.querySelector('#mainCanvas')
        if (!canvas || !canvas.width || !canvas.height) return { ok: false, reason: 'main canvas is missing or has no size' }
        const context = canvas.getContext('2d')
        if (!context) return { ok: false, reason: 'main canvas has no 2D context' }
        const sample = context.getImageData(0, 0, Math.min(canvas.width, 320), Math.min(canvas.height, 180)).data
        let min = 255
        let max = 0
        for (let index = 0; index < sample.length; index += 4 * 97) {
          const value = (sample[index] + sample[index + 1] + sample[index + 2]) / 3
          if (value < min) min = value
          if (value > max) max = value
        }
        return { ok: max - min > 12, reason: max - min > 12 ? 'rendered' : 'main canvas appears blank' }
      })
      if (!render.ok) throw new Error(`Rendering defect: ${render.reason}`)

      const file = join(output, `final-${name}.png`)
      await page.screenshot({ path: file, timeout: 30000 }).catch(error => {
        if (error.name === 'TimeoutError' || !browser.isConnected()) transient(error)
        throw error
      })
      if (!existsSync(file) || statSync(file).size < 5000) throw new Error(`Screenshot ${file} is missing or too small.`)
      console.log(`Captured ${name} ${width}x${height} -> ${file} (${(statSync(file).size / 1024).toFixed(0)} KiB)`)
    } finally {
      await page?.close().catch(error => console.error(`Could not close ${name} page: ${error.message}`))
    }
  }
} catch (error) {
  failure = error
  console.error(error)
} finally {
  await browser?.close().catch(error => {
    console.error(`Could not close browser: ${error.message}`)
    if (!failure) failure = Object.assign(error, { exitCode: 75 })
  })
}

if (pageErrors.length) {
  console.error(`Page errors detected: ${pageErrors.join(' | ')}`)
  process.exit(failure ? exitCodeFor(failure) : 1)
}
process.exit(failure ? exitCodeFor(failure) : 0)
