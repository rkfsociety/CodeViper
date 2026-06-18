import { defineConfig } from '@playwright/test'
import path from 'path'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    // Путь к скомпилированному main-процессу Electron
    executablePath: undefined
  },
  // Electron не использует браузерные проекты — конфиг projects не нужен
  projects: []
})

// Хелпер для тестов: путь к main-entry Electron
export const electronMain = path.resolve(__dirname, 'out/main/index.js')
