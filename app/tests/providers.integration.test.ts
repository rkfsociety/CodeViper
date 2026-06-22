/**
 * Интеграционные тесты OllamaProvider и OpenAIProvider.
 *
 * Мокаем глобальный fetch через vi.stubGlobal — никаких внешних зависимостей.
 * Тестируемые сценарии:
 *   1. Успешный tool call (OpenAI-нативный формат delta.tool_calls)
 *   2. Стриминг текста по кускам
 *   3. Ответ 429 (rate limit / too many requests)
 *   4. Разрыв соединения на полуслове (ReadableStream выбрасывает ошибку)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OllamaProvider } from '../electron/main/providers/ollamaProvider'
import { OpenAIProvider } from '../electron/main/providers/openaiProvider'
import type { ChatOptions } from '../shared/modelProvider'

// ──────────────────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ──────────────────────────────────────────────────────────────────────────────

const enc = new TextEncoder()

/** Создаёт ReadableStream, который выдаёт переданные строки и завершается нормально. */
function makeStream(chunks: string[]): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(enc.encode(chunk))
      }
      controller.close()
    }
  })
}

/**
 * Создаёт ReadableStream, который выдаёт `goodChunks` по одному, а затем
 * выбрасывает ошибку — имитация разрыва TCP-соединения.
 */
function makeBrokenStream(
  goodChunks: string[],
  errorMessage = 'connection reset by peer'
): ReadableStream<Uint8Array> {
  let i = 0
  return new ReadableStream({
    pull(controller) {
      if (i < goodChunks.length) {
        controller.enqueue(enc.encode(goodChunks[i++]))
      } else {
        controller.error(new Error(errorMessage))
      }
    }
  })
}

/** Создаёт мок Response с body-стримом. */
function makeResponse(body: ReadableStream<Uint8Array>, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    body,
    text: async () => '',
    json: async () => ({})
  } as unknown as Response
}

/** Собирает все чанки из AsyncGenerator в массив. */
async function collectChunks<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const result: T[] = []
  for await (const chunk of gen) {
    result.push(chunk)
  }
  return result
}

const BASE_CHAT_OPTIONS: ChatOptions = {
  model: 'llama3',
  messages: [{ role: 'user', content: 'Привет' }]
}

// ──────────────────────────────────────────────────────────────────────────────
// OllamaProvider
// ──────────────────────────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  let provider: OllamaProvider
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    provider = new OllamaProvider('http://localhost:11434')
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ── 1. Стриминг текста ──────────────────────────────────────────────────────

  it('стримит текстовый ответ по нескольким NDJSON-строкам', async () => {
    const lines =
      '{"message":{"content":"При"},"model":"llama3"}\n' +
      '{"message":{"content":"вет"},"model":"llama3"}\n' +
      '{"message":{"content":"!"},"model":"llama3","stop_reason":"stop"}\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([lines])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    expect(chunks).toHaveLength(3)
    expect(chunks.map((c) => c.content).join('')).toBe('Привет!')
    expect(chunks[2].stop_reason).toBe('stop')
    expect(chunks[0].model).toBe('llama3')
  })

  it('стримит ответ с thinking-блоком', async () => {
    const line = '{"message":{"content":"ок","thinking":"думаю..."},"model":"llama3"}\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([line])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    expect(chunks[0].content).toBe('ок')
    expect(chunks[0].thinking).toBe('думаю...')
  })

  it('передаёт параметры tools в тело запроса', async () => {
    const line = '{"message":{"content":"done"},"stop_reason":"stop"}\n'
    fetchMock.mockResolvedValue(makeResponse(makeStream([line])))

    const tools = [
      {
        name: 'read_file',
        description: 'Читает файл',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } }
      }
    ]
    await collectChunks(provider.chat({ ...BASE_CHAT_OPTIONS, tools }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string)
    expect(body.tools).toEqual(tools)
    // tool_choice не должен передаваться — Ollama не поддерживает
    expect(body.tool_choice).toBeUndefined()
  })

  // ── 2. Tool call (текстовый embedded-формат Ollama) ─────────────────────────

  it('правильно стримит контент, содержащий embedded tool call', async () => {
    // Ollama возвращает tool call как текст — провайдер просто стримит контент,
    // разбор делает shared/toolCalls.ts на уровне агента.
    const tc = JSON.stringify({ name: 'read_file', arguments: { path: '/tmp/a.txt' } })
    // Используем JSON.stringify чтобы правильно экранировать кавычки внутри content
    const line = JSON.stringify({ message: { content: tc }, stop_reason: 'stop' }) + '\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([line])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    expect(chunks[0].content).toContain('read_file')
    expect(chunks[0].stop_reason).toBe('stop')
  })

  // ── 3. Ответ 429 ────────────────────────────────────────────────────────────

  it('бросает ошибку при ответе 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: 'rate limit exceeded' }),
      body: makeStream([])
    } as unknown as Response)

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow(/429/)
  })

  it('бросает ошибку с понятным текстом при 404 (модель не найдена)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      text: async () =>
        JSON.stringify({ error: "model 'llama3' not found, try ollama pull llama3" }),
      body: makeStream([])
    } as unknown as Response)

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow(/не найдена/)
  })

  // ── 4. Разрыв соединения ────────────────────────────────────────────────────

  it('пробрасывает ошибку при разрыве стрима на полуслове', async () => {
    // Один хороший чанк, затем обрыв
    const goodLine = '{"message":{"content":"При"},"model":"llama3"}\n'
    fetchMock.mockResolvedValue(makeResponse(makeBrokenStream([goodLine])))

    const gen = provider.chat(BASE_CHAT_OPTIONS)
    const first = await gen.next()
    expect(first.value?.content).toBe('При')

    await expect(gen.next()).rejects.toThrow('connection reset by peer')
  })

  // ── Ping / listModels ───────────────────────────────────────────────────────

  it('ping возвращает true при ok-ответе', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response)
    expect(await provider.ping()).toBe(true)
  })

  it('ping возвращает false при ошибке сети', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await provider.ping()).toBe(false)
  })

  it('listModels парсит /api/ps', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        models: [{ name: 'llama3:latest', size: 4_000_000_000, size_vram: 3_800_000_000 }]
      })
    } as unknown as Response)

    const models = await provider.listModels()
    expect(models).toHaveLength(1)
    expect(models[0].name).toBe('llama3:latest')
    // size_vram имеет приоритет над size
    expect(models[0].size).toBe(3_800_000_000)
  })
})

// ──────────────────────────────────────────────────────────────────────────────
// OpenAIProvider
// ──────────────────────────────────────────────────────────────────────────────

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    provider = new OpenAIProvider('https://api.openai.com/v1', 'sk-test', 'gpt-4o')
    // Отключаем retry-backoff чтобы тесты на 429 не ждали реальных задержек
    ;(provider as unknown as { BACKOFF_MS: number[] }).BACKOFF_MS = []
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  /** Формирует SSE-строку с одним delta-чанком. */
  function sseLine(delta: Record<string, unknown>, finishReason: string | null = null) {
    return (
      'data: ' +
      JSON.stringify({
        choices: [{ delta, finish_reason: finishReason }]
      }) +
      '\n\n'
    )
  }

  // ── 1. Стриминг текста ──────────────────────────────────────────────────────

  it('стримит текстовый ответ по SSE', async () => {
    const sse =
      sseLine({ content: 'При' }) +
      sseLine({ content: 'вет' }) +
      sseLine({ content: '!' }, 'stop') +
      'data: [DONE]\n\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    const text = chunks.map((c) => c.content).join('')
    expect(text).toBe('Привет!')
    const stopChunk = chunks.find((c) => c.stop_reason === 'stop')
    expect(stopChunk).toBeDefined()
  })

  it('передаёт Authorization-заголовок', async () => {
    const sse = sseLine({ content: 'ok' }, 'stop') + 'data: [DONE]\n\n'
    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer sk-test')
  })

  it('передаёт дополнительные заголовки (extraHeaders)', async () => {
    const custom = new OpenAIProvider('https://openrouter.ai/api/v1', 'sk-or-test', 'gpt-4o', {
      'HTTP-Referer': 'http://localhost'
    })
    fetchMock.mockResolvedValue(
      makeResponse(makeStream([sseLine({ content: '' }, 'stop') + 'data: [DONE]\n\n']))
    )

    await collectChunks(custom.chat(BASE_CHAT_OPTIONS))

    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['HTTP-Referer']).toBe('http://localhost')
  })

  // ── 2. Успешный tool call ───────────────────────────────────────────────────

  it('собирает delta.tool_calls и выдаёт их в финальном чанке', async () => {
    // OpenAI стримит tool_calls по частям: сначала id+name, потом аргументы
    const sse =
      'data: ' +
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_abc',
                  type: 'function',
                  function: { name: 'read_file', arguments: '' }
                }
              ]
            },
            finish_reason: null
          }
        ]
      }) +
      '\n\n' +
      'data: ' +
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [{ index: 0, function: { arguments: '{"path":"/tmp/a.txt"}' } }]
            },
            finish_reason: null
          }
        ]
      }) +
      '\n\n' +
      'data: ' +
      JSON.stringify({
        choices: [{ delta: {}, finish_reason: 'tool_calls' }]
      }) +
      '\n\n' +
      'data: [DONE]\n\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    const withTool = chunks.find((c) => c.tool_calls && c.tool_calls.length > 0)
    expect(withTool).toBeDefined()
    expect(withTool!.tool_calls![0].id).toBe('call_abc')
    expect(withTool!.tool_calls![0].function.name).toBe('read_file')
    expect(withTool!.tool_calls![0].function.arguments).toBe('{"path":"/tmp/a.txt"}')
  })

  it('fallback: выдаёт накопленные tool_calls если стрим завершился без finish_reason=tool_calls', async () => {
    const sse =
      'data: ' +
      JSON.stringify({
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: 'call_xyz',
                  type: 'function',
                  function: { name: 'list_files', arguments: '{}' }
                }
              ]
            },
            finish_reason: null
          }
        ]
      }) +
      '\n\n' +
      'data: [DONE]\n\n'

    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    const chunks = await collectChunks(provider.chat(BASE_CHAT_OPTIONS))

    const withTool = chunks.find((c) => c.tool_calls && c.tool_calls.length > 0)
    expect(withTool).toBeDefined()
    expect(withTool!.tool_calls![0].function.name).toBe('list_files')
  })

  it('конвертирует tools из Anthropic-формата в OpenAI-формат', async () => {
    const sse = sseLine({ content: '' }, 'stop') + 'data: [DONE]\n\n'
    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    const tools = [
      {
        name: 'read_file',
        description: 'Читает файл',
        input_schema: { type: 'object', properties: { path: { type: 'string' } } }
      }
    ]
    await collectChunks(provider.chat({ ...BASE_CHAT_OPTIONS, tools }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      tools: Array<{ type: string; function: { name: string } }>
    }
    expect(body.tools[0].type).toBe('function')
    expect(body.tools[0].function.name).toBe('read_file')
  })

  // ── 3. Ответ 429 ────────────────────────────────────────────────────────────

  it('бросает ошибку с кодом 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () =>
        JSON.stringify({ error: { message: 'Rate limit exceeded. Try again in 20s.' } }),
      body: null
    } as unknown as Response)

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow(/429/)
  })

  it('включает сообщение от API в текст ошибки при 429', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => JSON.stringify({ error: { message: 'You exceeded your quota.' } }),
      body: null
    } as unknown as Response)

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow(
      /You exceeded your quota/
    )
  })

  it('бросает ошибку при 401 (неверный API-ключ)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { message: 'Invalid API key.' } }),
      body: null
    } as unknown as Response)

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow(/401/)
  })

  // ── 4. Разрыв соединения ────────────────────────────────────────────────────

  it('пробрасывает ошибку при разрыве стрима после первого чанка', async () => {
    const goodLine = sseLine({ content: 'При' })
    fetchMock.mockResolvedValue(makeResponse(makeBrokenStream([goodLine])))

    const gen = provider.chat(BASE_CHAT_OPTIONS)
    const first = await gen.next()
    expect(first.value?.content).toBe('При')

    await expect(gen.next()).rejects.toThrow('connection reset by peer')
  })

  it('пробрасывает ошибку при разрыве до первого чанка', async () => {
    fetchMock.mockResolvedValue(makeResponse(makeBrokenStream([], 'socket hang up')))

    await expect(collectChunks(provider.chat(BASE_CHAT_OPTIONS))).rejects.toThrow('socket hang up')
  })

  // ── Ping / listModels ───────────────────────────────────────────────────────

  it('ping возвращает true при ok-ответе от /models', async () => {
    fetchMock.mockResolvedValue({ ok: true } as Response)
    expect(await provider.ping()).toBe(true)
  })

  it('ping возвращает false при сетевой ошибке', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'))
    expect(await provider.ping()).toBe(false)
  })

  it('listModels возвращает список из data[]', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 'gpt-4o', context_length: 128_000 }, { id: 'gpt-3.5-turbo' }]
      })
    } as unknown as Response)

    const models = await provider.listModels()
    expect(models).toHaveLength(2)
    expect(models[0].name).toBe('gpt-4o')
    expect(models[0].contextLength).toBe(128_000)
    expect(models[1].name).toBe('gpt-3.5-turbo')
  })

  it('listModels возвращает [] при ошибке сети', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'))
    expect(await provider.listModels()).toEqual([])
  })

  it('listModels использует listModelsUrl если передан', async () => {
    const customProvider = new OpenAIProvider(
      'https://api.example.com/v1',
      'key',
      'model',
      {},
      'https://api.example.com/v1/custom/models'
    )
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ id: 'custom-model' }] })
    } as unknown as Response)

    await customProvider.listModels()

    const url = fetchMock.mock.calls[0][0] as string
    expect(url).toBe('https://api.example.com/v1/custom/models')
  })

  // ── reasoning_effort для o1/o3/r1 ──────────────────────────────────────────

  it('добавляет reasoning_effort для o1-моделей', async () => {
    const sse = sseLine({ content: '' }, 'stop') + 'data: [DONE]\n\n'
    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    await collectChunks(provider.chat({ ...BASE_CHAT_OPTIONS, model: 'o1-mini' }))

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      reasoning_effort?: string
    }
    expect(body.reasoning_effort).toBe('medium')
  })

  it('не добавляет reasoning_effort для обычных моделей', async () => {
    const sse = sseLine({ content: '' }, 'stop') + 'data: [DONE]\n\n'
    fetchMock.mockResolvedValue(makeResponse(makeStream([sse])))

    await collectChunks(provider.chat(BASE_CHAT_OPTIONS)) // model: 'llama3'

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as {
      reasoning_effort?: string
    }
    expect(body.reasoning_effort).toBeUndefined()
  })
})
