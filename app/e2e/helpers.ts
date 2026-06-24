import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN_PATH = path.resolve(__dirname, '../out/main/index.js')

const CI_ELECTRON_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage', // предотвращает OOM в /dev/shm на Linux CI
  '--disable-software-rasterizer'
]

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN_PATH, ...(process.env.CI ? CI_ELECTRON_FLAGS : [])],
    timeout: 60_000,
    env: {
      ...process.env,
      CODEVIPER_E2E: '1',
      NODE_ENV: 'test',
      // xvfb-run выставляет DISPLAY, но Electron должен его видеть явно
      DISPLAY: process.env.DISPLAY ?? ':99',
      // Electron/Chromium логи для диагностики в CI
      ELECTRON_ENABLE_LOGGING: process.env.CI ? '1' : ''
    }
  })

  const page = await app.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
