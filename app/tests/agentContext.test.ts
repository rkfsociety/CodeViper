import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/context' }
}))

vi.mock('../electron/main/services', () => ({
  buildFileTree: async () => [{ name: 'src', path: '/p/src', isDirectory: true, children: [] }]
}))

vi.mock('../electron/main/memory', () => ({
  buildMemoryContext: async () => '## ViperMemory.md — накопленные знания\n1. [preference] Тест'
}))

vi.mock('../electron/main/skills', () => ({
  buildSkillsContext: async () => '## Активные навыки (skills)\n1. **Viper Memory**'
}))

import { buildAgentContextPreview, estimateTokens } from '../electron/main/agentContext'
import type { ChatMessage } from '../src/types'

describe('estimateTokens', () => {
  it('оценивает токены из символов', () => {
    expect(estimateTokens(3500)).toBe(1000)
  })
})

describe('buildAgentContextPreview', () => {
  it('собирает секции и сообщения', async () => {
    const history: ChatMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'Привет',
        timestamp: 1
      }
    ]

    const preview = await buildAgentContextPreview(
      '/project',
      history,
      'Новая задача',
      'qwen2.5-coder:7b'
    )

    expect(preview.model).toBe('qwen2.5-coder:7b')
    expect(preview.sections.length).toBeGreaterThanOrEqual(4)
    expect(preview.messages.length).toBe(3)
    expect(preview.messages[0].role).toBe('system')
    expect(preview.messages.at(-1)?.content).toBe('Новая задача')
    expect(preview.totalChars).toBeGreaterThan(0)
    expect(preview.toolCount).toBeGreaterThan(0)
    expect(preview.contextUsagePercent).toBeGreaterThanOrEqual(0)
    expect(preview.contextLimitTokens).toBeGreaterThan(0)
  })
})
