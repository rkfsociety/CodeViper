import { describe, it, expect, vi, afterEach } from 'vitest'
import type { OllamaMessage } from '../electron/main/agentContext'
import { compressContextMessages, summarizeOllamaMessages } from '../electron/main/contextSummarizer'

function hugeHistory(extraMessages = 40): OllamaMessage[] {
  const messages: OllamaMessage[] = [
    { role: 'system', content: 'system '.repeat(800) },
    ...Array.from({ length: extraMessages }, (_, index) => ({
      role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `msg-${index} `.repeat(1200)
    })),
    { role: 'user', content: 'текущий запрос' }
  ]
  return messages
}

describe('contextSummarizer', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('summarizeOllamaMessages вызывает /api/chat', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Краткая сводка' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const summary = await summarizeOllamaMessages('http://127.0.0.1:11434', 'qwen2.5-coder:7b', [
      { role: 'user', content: 'старый вопрос' },
      { role: 'assistant', content: 'старый ответ' }
    ])

    expect(summary).toBe('Краткая сводка')
    expect(fetchMock).toHaveBeenCalled()
  })

  it('суммаризирует старую историю при ~85%+ лимита', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: { content: 'Сводка: правили agent.ts' } })
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000,
      ollamaUrl: 'http://127.0.0.1:11434'
    })

    expect(result.summarized).toBe(true)
    expect(result.messages.some((message) => message.content.includes('Сводка предыдущего контекста'))).toBe(
      true
    )
    expect(result.usagePercent).toBeLessThan(95)
  })

  it('обрезает историю без Ollama URL', async () => {
    const result = await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000
    })

    expect(result.truncated).toBe(true)
    expect(result.summarized).toBe(false)
    expect(result.messages.length).toBeLessThan(hugeHistory().length)
  })
})
