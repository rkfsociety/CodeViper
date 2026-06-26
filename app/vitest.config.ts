import { defineConfig } from 'vitest/config'

const ELECTRON_MAIN_THRESHOLDS = {
  branches: 50
} as const

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'shared/**/*.ts',
        'electron/main/services.ts',
        'electron/main/agentLoopGuard.ts',
        'electron/main/runCheckpoint.ts',
        'electron/main/commandRunner.ts'
      ],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
        'electron/main/agentLoopGuard.ts': ELECTRON_MAIN_THRESHOLDS,
        'electron/main/runCheckpoint.ts': ELECTRON_MAIN_THRESHOLDS,
        'electron/main/commandRunner.ts': ELECTRON_MAIN_THRESHOLDS
      }
    }
  }
})
