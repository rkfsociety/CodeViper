/**
 * Генерация демо-GIF для README из HTML-макетов в docs/media/source/.
 * Запуск: cd app && npm run capture:readme-media
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..')
const require = createRequire(path.join(REPO_ROOT, 'app/package.json'))
const { chromium } = require('playwright')
const { PNG } = require('pngjs')
const { GIFEncoder, quantize, applyPalette } = require('gifenc')
const SOURCE_DIR = path.join(REPO_ROOT, 'docs/media/source')
const OUT_DIR = path.join(REPO_ROOT, 'docs/media')

const DEMOS = [
  { html: 'search.html', out: 'search.gif', frames: 8, stepMs: 280 },
  { html: 'self-improve.html', out: 'self-improve.gif', frames: 8, stepMs: 280 },
  { html: 'ollama.html', out: 'ollama.gif', frames: 8, stepMs: 280 }
]

function pngBuffersToGif(pngBuffers, delayCs) {
  const first = PNG.sync.read(pngBuffers[0])
  const { width, height } = first
  const gif = GIFEncoder()

  for (const buf of pngBuffers) {
    const png = PNG.sync.read(buf)
    if (png.width !== width || png.height !== height) {
      throw new Error('Все кадры должны быть одного размера')
    }
    const rgba = new Uint8Array(png.data)
    const palette = quantize(rgba, 256)
    const index = applyPalette(rgba, palette)
    gif.writeFrame(index, width, height, { palette, delay: delayCs })
  }

  gif.finish()
  return Buffer.from(gif.bytes())
}

async function captureDemo(browser, demo) {
  const page = await browser.newPage({
    viewport: { width: 960, height: 600 },
    deviceScaleFactor: 1
  })

  const fileUrl = `file:///${path.join(SOURCE_DIR, demo.html).replace(/\\/g, '/')}`
  await page.goto(fileUrl, { waitUntil: 'load' })

  const frames = []
  for (let i = 0; i < demo.frames; i++) {
    frames.push(await page.screenshot({ type: 'png' }))
    await page.waitForTimeout(demo.stepMs)
  }

  await page.close()
  return pngBuffersToGif(frames, Math.round(demo.stepMs / 10))
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  try {
    for (const demo of DEMOS) {
      const outPath = path.join(OUT_DIR, demo.out)
      const gif = await captureDemo(browser, demo)
      fs.writeFileSync(outPath, gif)
      const kb = Math.round(gif.length / 1024)
      console.log(`✓ ${demo.out} (${kb} KB)`)
    }
  } finally {
    await browser.close()
  }

  console.log(`\nГотово: ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
