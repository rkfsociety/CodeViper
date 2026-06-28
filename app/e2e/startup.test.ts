import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers'

test.describe('Запуск приложения', () => {
  test('окно открывается с заголовком CodeViper и версией', async () => {
    const { app, page } = await launchApp()
    try {
      const title = await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()[0]?.getTitle()
      )
      expect(title).toMatch(/^CodeViper \d+\.\d+\.\d+( [0-9a-f]{7})?$/)
    } finally {
      await closeApp(app)
    }
  })

  test('логотип CodeViper виден в топбаре', async () => {
    const { app, page } = await launchApp()
    try {
      const logo = page.locator('.logo')
      await expect(logo).toBeVisible({ timeout: 10_000 })
      await expect(logo).toContainText('CodeViper')
    } finally {
      await closeApp(app)
    }
  })

  test('кнопка Настройки присутствует', async () => {
    const { app, page } = await launchApp()
    try {
      const btn = page.getByRole('button', { name: 'Настройки' })
      await expect(btn).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })
})
