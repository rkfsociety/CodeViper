import { test, expect } from '@playwright/test'
import { launchApp, closeApp, ensureActiveChat } from './helpers'

test.describe('Чат', () => {
  test('панель агента и поле ввода присутствуют', async () => {
    const { app, page } = await launchApp()
    try {
      // Заголовок панели агента
      const agentHeader = page.locator('.panel-header', { hasText: 'Агент' })
      await expect(agentHeader).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })

  test('панель истории чатов присутствует', async () => {
    const { app, page } = await launchApp()
    try {
      const historyHeader = page.locator('.panel-header', { hasText: 'История чатов' })
      await expect(historyHeader).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })

  test('пикер модели виден и содержит текст', async () => {
    const { app, page } = await launchApp()
    try {
      await ensureActiveChat(page)
      const picker = page.locator('[data-testid="model-picker-btn"]')
      await expect(picker).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })

  test('поле ввода сообщения существует', async () => {
    const { app, page } = await launchApp()
    try {
      await ensureActiveChat(page)
      const input = page.locator('textarea').first()
      await expect(input).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })

  test('ввод текста в поле сообщения работает', async () => {
    const { app, page } = await launchApp()
    try {
      await ensureActiveChat(page)
      const input = page.locator('textarea').first()
      await expect(input).toBeVisible({ timeout: 10_000 })
      await expect(input).toBeEnabled({ timeout: 5_000 })
      await input.fill('Привет, тест!')
      await expect(input).toHaveValue('Привет, тест!')
    } finally {
      await closeApp(app)
    }
  })
})
