import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test'
import path from 'path'

const MAIN_PATH = path.resolve(__dirname, '../out/main/index.js')

export async function launchApp(): Promise<{ app: ElectronApplication; page: Page }> {
  const app = await electron.launch({
    args: [MAIN_PATH],
    env: {
      ...process.env,
      // Отключить git-sync при запуске чтобы тест не ждал сеть
      CODEVIPER_E2E: '1',
      NODE_ENV: 'test'
    }
  })

  const page = await app.firstWindow()
  // Ждём пока рендерер загрузится
  await page.waitForLoadState('domcontentloaded')
  return { app, page }
}

export async function closeApp(app: ElectronApplication): Promise<void> {
  await app.close()
}
