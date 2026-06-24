import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import { createRequire } from 'module'
import path from 'path'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const ELECTRON_PATH = require('electron') as string

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const MAIN_PATH = path.resolve(__dirname, '../out/main/index.js')

const CI_ELECTRON_FLAGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--disable-software-rasterizer',
  '--ozone-platform=x11'
]

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    executablePath: ELECTRON_PATH,
    args: [MAIN_PATH, ...(process.env.CI ? CI_ELECTRON_FLAGS : [])],
    timeout: 60_000,
    env: {
      ...process.env,
      CODEVIPER_E2E: '1',
      NODE_ENV: 'test',
      ELECTRON_ENABLE_LOGGING: process.env.CI ? '1' : ''
    }
  })

  const page = await app.firstWindow({ timeout: 60_000 })
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  try {
    await app.evaluate(({ app: electronApp }) => {
      electronApp.exit(0)
    })
  } catch {
    // процесс уже завершился
  }
  try {
    await app.close()
  } catch {
    // ignore
  }
}
