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

const MODAL_DISMISS_TIMEOUT_MS = 20_000

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
  await dismissBlockingModals(page)
  return { app, page }
}

/** Закрывает модалки, которые появляются асинхронно после loadSettings (security notice, crash recovery). */
export async function dismissBlockingModals(page: Page): Promise<void> {
  const deadline = Date.now() + MODAL_DISMISS_TIMEOUT_MS
  let stableHidden = 0

  while (Date.now() < deadline) {
    const backdrop = page.locator('.modal-backdrop')
    const visible = await backdrop.isVisible().catch(() => false)

    if (!visible) {
      stableHidden += 1
      if (stableHidden >= 3) return
      await page.waitForTimeout(400)
      continue
    }

    stableHidden = 0

    const dismissed = await tryDismissVisibleModal(page)
    if (!dismissed) {
      await page.keyboard.press('Escape').catch(() => {})
    }

    await backdrop.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {})
    await page.waitForTimeout(200)
  }
}

async function tryDismissVisibleModal(page: Page): Promise<boolean> {
  for (const name of ['ОК', 'Удалить', 'Отмена']) {
    const btn = page.getByRole('button', { name, exact: true })
    if (await btn.isVisible({ timeout: 300 }).catch(() => false)) {
      await btn.click()
      return true
    }
  }

  const closeBtn = page.locator('.modal-close')
  if (await closeBtn.isVisible({ timeout: 300 }).catch(() => false)) {
    await closeBtn.click()
    return true
  }

  return false
}

/** Создаёт активный чат — нужен для тестов поля ввода и пикера модели. */
export async function ensureActiveChat(page: Page): Promise<void> {
  await dismissBlockingModals(page)
  const newChatBtn = page.locator('button', { hasText: '+ Чат' })
  await newChatBtn.click({ timeout: 15_000 })
  await dismissBlockingModals(page)
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
