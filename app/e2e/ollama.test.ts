import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers'

test.describe('Ollama ping', () => {
  test('индикатор статуса Ollama виден в топбаре', async () => {
    const { app, page } = await launchApp()
    try {
      // .status-dot должен появиться — онлайн или офлайн, не важно
      const dot = page.locator('.status-dot')
      await expect(dot).toBeVisible({ timeout: 10_000 })
    } finally {
      await closeApp(app)
    }
  })

  test('пилюля статуса Ollama видна', async () => {
    const { app, page } = await launchApp()
    try {
      // Ждём появления пилюли — либо "Ollama" (онлайн) либо "Ollama offline"
      const pill = page.locator('.topbar-pill').first()
      await expect(pill).toBeVisible({ timeout: 10_000 })
      const text = await pill.innerText()
      expect(['Ollama', 'Ollama offline']).toContain(text.trim())
    } finally {
      await closeApp(app)
    }
  })
})
