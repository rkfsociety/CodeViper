import { describe, it, expect, vi, afterEach } from 'vitest'
import type { OllamaMessage } from '../electron/main/agentContext'
import { compressContextMessages } from '../electron/main/contextSummarizer'

/** Мок fetch, возвращающий Ollama-style NDJSON стрим с одним чанком контента */
function makeOllamaStreamMock(content: string) {
  const line = JSON.stringify({ message: { role: 'assistant', content }, done: true }) + '\n'
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(line))
      controller.close()
    }
  })
  return vi.fn().mockResolvedValue({ ok: true, body: stream })
}

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

  it('вызывает fetch при суммаризации через ollamaUrl', async () => {
    const fetchMock = makeOllamaStreamMock('Краткая сводка')
    vi.stubGlobal('fetch', fetchMock)

    const result = await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000,
      ollamaUrl: 'http://127.0.0.1:11434'
    })

    expect(fetchMock).toHaveBeenCalled()
    expect(result.summarized).toBe(true)
  })

  it('использует summarizeModel вместо основной модели агента', async () => {
    const fetchMock = makeOllamaStreamMock('Сводка')
    vi.stubGlobal('fetch', fetchMock)

    await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:14b',
      summarizeModel: 'qwen2.5-coder:3b',
      toolsJsonChars: 20_000,
      ollamaUrl: 'http://127.0.0.1:11434'
    })

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))
    expect(body.model).toBe('qwen2.5-coder:3b')
  })

  it('суммаризирует старую историю при ~85%+ лимита', async () => {
    const fetchMock = makeOllamaStreamMock('Сводка: правили agent.ts')
    vi.stubGlobal('fetch', fetchMock)

    const result = await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000,
      ollamaUrl: 'http://127.0.0.1:11434'
    })

    expect(result.summarized).toBe(true)
    expect(
      result.messages.some((message) => message.content.includes('Сводка предыдущего контекста'))
    ).toBe(true)
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

  it('зовёт onCompressStart, когда сжатие реально началось', async () => {
    const onCompressStart = vi.fn()
    await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000,
      onCompressStart
    })

    expect(onCompressStart).toHaveBeenCalledTimes(1)
  })

  it('не зовёт onCompressStart, когда контекст в пределах лимита', async () => {
    const onCompressStart = vi.fn()
    const result = await compressContextMessages({
      messages: [
        { role: 'system', content: 'system' },
        { role: 'user', content: 'короткий запрос' }
      ],
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 100,
      onCompressStart
    })

    expect(result.summarized).toBe(false)
    expect(result.truncated).toBe(false)
    expect(onCompressStart).not.toHaveBeenCalled()
  })

  it('preferTruncateOverLlmSummarize: обрезка без fetch к модели', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await compressContextMessages({
      messages: hugeHistory(),
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 20_000,
      ollamaUrl: 'http://127.0.0.1:11434',
      preferTruncateOverLlmSummarize: true
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(result.summarized).toBe(false)
    expect(result.truncated).toBe(true)
    expect(result.messages.length).toBeLessThan(hugeHistory().length)
  })

  it('dropSupersededErrors оставляет только последний результат одного инструмента', async () => {
    const fileBody = 'export const x = 1\n'.repeat(800)
    const messages: OllamaMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'task' },
      { role: 'tool', content: `Инструмент read_file:\n${fileBody}` },
      { role: 'tool', content: `Инструмент read_file:\n${fileBody}` },
      { role: 'tool', content: `Инструмент read_file:\n${fileBody}` },
      { role: 'user', content: 'продолжай' }
    ]

    const result = await compressContextMessages({
      messages,
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 500,
      preferTruncateOverLlmSummarize: true,
      summarizeThresholdPercent: 50
    })

    const toolMsgs = result.messages.filter((m) => m.role === 'tool')
    expect(toolMsgs.length).toBeLessThanOrEqual(1)
  })

  it('dropSupersededErrors сохраняет ENOENT после успешного read_file того же инструмента', async () => {
    const messages: OllamaMessage[] = [
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'task' },
      { role: 'tool', content: 'Инструмент read_file:\n# ROADMAP index' },
      {
        role: 'tool',
        content:
          'Инструмент read_file:\nОшибка: ENOENT: no such file or directory\n\nФайл не существует.'
      },
      { role: 'user', content: 'продолжай' }
    ]

    const result = await compressContextMessages({
      messages,
      model: 'qwen2.5-coder:7b',
      toolsJsonChars: 500,
      preferTruncateOverLlmSummarize: true,
      summarizeThresholdPercent: 50
    })

    const toolMsgs = result.messages.filter((m) => m.role === 'tool')
    expect(toolMsgs).toHaveLength(1)
    expect(toolMsgs[0].content).toMatch(/ENOENT/)
  })
})
