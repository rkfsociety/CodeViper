/**
 * Интеграционный тест полного прогона AgentRunner.
 *
 * Изолируем ModelRuntime, agentContext, agentLogger, electron.
 * Проверяем сквозной сценарий:
 *   запрос → tool call от модели → executeTool → результат → финальный ответ → emit('done')
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// vi.hoisted() гарантирует, что объект создаётся до любых vi.mock() фабрик
const chatState = vi.hoisted(() => ({
  impl: null as null | (() => AsyncGenerator<{ content: string }>)
}))

// ── Электрон ────────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/integration' }
}))

// ── Логгер ──────────────────────────────────────────────────────────────────
vi.mock('../electron/main/agentLogger', () => ({
  agentLogger: { write: vi.fn().mockResolvedValue(undefined) }
}))

// ── agentContext ─────────────────────────────────────────────────────────────
vi.mock('../electron/main/agentContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../electron/main/agentContext')>()
  return {
    ...original,
    prepareAgentRunContext: vi.fn().mockResolvedValue({
      messages: [{ role: 'system', content: 'system prompt' }],
      preview: {
        sections: [],
        totalChars: 100,
        contextUsagePercent: 5,
        historySummarized: false
      }
    })
  }
})

// ── selfCommit ───────────────────────────────────────────────────────────────
vi.mock('../electron/main/selfCommit', () => ({
  commitAndPushSelfEdits: vi.fn().mockResolvedValue({ ok: true, message: 'ok' })
}))

// ── ModelRuntime — использует chatState.impl из vi.hoisted() ─────────────────
vi.mock('../electron/main/modelRuntime', () => {
  function MockModelRuntime() {
    /* пустой конструктор */
  }

  MockModelRuntime.prototype.getModelPlacement = function () {
    return Promise.resolve('gpu')
  }

  MockModelRuntime.prototype.chat = async function* () {
    if (!chatState.impl) throw new Error('chatState.impl не задан в тесте')
    yield* chatState.impl()
  }

  return { ModelRuntime: MockModelRuntime }
})

import { AgentRunner } from '../electron/main/agent'
import type { AgentStreamPayload, AgentSettings } from '../src/types'

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    model: 'test-model',
    ollamaUrl: 'http://localhost:11434',
    ...overrides
  }
}

// ── Хелпер: последовательность ответов модели ────────────────────────────────
// Каждый элемент массива — это один вызов chat() (один шаг агента).
// Внутри каждого шага — массив чанков.
type MockChatChunk = {
  content: string
  input_tokens?: number
  output_tokens?: number
}

// Tool call передаётся как JSON в поле content, т.к. AgentRunner.chat()
// извлекает инструменты через extractEmbeddedToolCalls(content), а НЕ из chunk.tool_calls.
function makeResponses(steps: Array<Array<MockChatChunk>>): () => AsyncGenerator<MockChatChunk> {
  let call = 0
  return async function* () {
    const chunks = steps[call] ?? steps[steps.length - 1]
    call++
    for (const c of chunks) yield c
  }
}

// Сформировать JSON tool call в контент — формат, который парсит extractEmbeddedToolCalls
function toolCallContent(name: string, args: Record<string, string>): string {
  return JSON.stringify({ name, arguments: args })
}

describe('AgentRunner — интеграционный прогон', () => {
  let projectDir: string
  let emitted: AgentStreamPayload[]
  let emit: (e: AgentStreamPayload) => void

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-integ-'))
    emitted = []
    emit = (e) => emitted.push(e)
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    vi.clearAllMocks()
    chatState.impl = null
  })

  it('простой текстовый ответ — emit assistant + done', async () => {
    chatState.impl = makeResponses([[{ content: 'Привет! Чем помочь?' }]])

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })

    await runner.run([], 'привет')

    const types = emitted.map((e) => e.type)
    expect(types).toContain('done')

    const assistantEvents = emitted.filter((e) => e.type === 'assistant') as Array<{
      type: 'assistant'
      content: string
    }>
    expect(assistantEvents.length).toBeGreaterThanOrEqual(1)
    expect(assistantEvents[0].content).toContain('Привет')
  })

  it('tool call list_directory → результат идёт в следующий запрос → финальный ответ', async () => {
    chatState.impl = makeResponses([
      // шаг 1: модель вызывает инструмент (JSON в content)
      [{ content: toolCallContent('list_directory', { path: projectDir }) }],
      // шаг 2: финальный ответ после результата
      [{ content: 'Папка пустая.' }]
    ])

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })

    await runner.run([], 'покажи папку')

    const types = emitted.map((e) => e.type)
    expect(types).toContain('tool_start')
    expect(types).toContain('tool_end')
    expect(types).toContain('done')

    const toolStart = emitted.find((e) => e.type === 'tool_start') as {
      type: 'tool_start'
      toolName: string
    }
    expect(toolStart.toolName).toBe('list_directory')
  })

  it('tool call read_file → результат содержит содержимое файла', async () => {
    const testFile = join(projectDir, 'hello.txt')
    writeFileSync(testFile, 'содержимое файла')

    chatState.impl = makeResponses([
      [{ content: toolCallContent('read_file', { path: testFile }) }],
      [{ content: 'Файл прочитан.' }]
    ])

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })

    await runner.run([], 'прочитай файл')

    const toolEnd = emitted.find((e) => e.type === 'tool_end') as {
      type: 'tool_end'
      toolOutput: string
    }
    expect(toolEnd).toBeDefined()
    expect(toolEnd.toolOutput).toContain('содержимое файла')
  })

  it('отклонённый confirm останавливает инструмент, агент продолжает', async () => {
    chatState.impl = makeResponses([
      [
        {
          content: toolCallContent('write_file', {
            path: join(projectDir, 'out.txt'),
            content: 'данные'
          })
        }
      ],
      [{ content: 'Операция отменена.' }]
    ])

    const confirm = vi.fn().mockResolvedValue(false)

    const runner = new AgentRunner({
      settings: makeSettings({ permissionMode: 'ask' }),
      projectPath: projectDir,
      emit,
      confirm
    })

    await runner.run([], 'запиши файл')

    expect(confirm).toHaveBeenCalledOnce()

    const toolEnd = emitted.find((e) => e.type === 'tool_end') as {
      type: 'tool_end'
      toolOutput: string
    }
    expect(toolEnd.toolOutput).toContain('отклонено')

    expect(emitted.map((e) => e.type)).toContain('done')
  })

  it('AbortSignal во время чата — emit Остановлено + done', async () => {
    const controller = new AbortController()

    // Прерываем ВНУТРИ генератора — агент уже запустил шаг
    chatState.impl = async function* () {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    }

    const runner = new AgentRunner({
      settings: makeSettings(),
      projectPath: projectDir,
      emit,
      signal: controller.signal
    })

    // run() должен завершиться без uncaught exception
    await expect(runner.run([], 'сделай что-нибудь')).resolves.toBeUndefined()

    const types = emitted.map((e) => e.type)
    expect(types).toContain('done')
    expect(types).toContain('error')

    const errorEvents = emitted.filter((e) => e.type === 'error') as Array<{
      type: 'error'
      content: string
    }>
    expect(errorEvents.some((e) => e.content.includes('Остановлено'))).toBe(true)
  })

  it('превышение maxCostPerRunUsd — abort с сообщением о лимите', async () => {
    let chatCalls = 0
    const baseImpl = makeResponses([
      [{ content: 'Шаг 1', input_tokens: 50_000, output_tokens: 5_000 }],
      [{ content: 'Шаг 2 — не должен выполниться' }]
    ])
    chatState.impl = async function* () {
      chatCalls++
      yield* baseImpl()
    }

    const runner = new AgentRunner({
      settings: makeSettings({
        model: 'gpt-4o-mini',
        modelProvider: 'openai',
        maxCostPerRunUsd: 0.001
      }),
      projectPath: projectDir,
      emit
    })

    await runner.run([], 'тест лимита стоимости')

    expect(chatCalls).toBe(1)
    const types = emitted.map((e) => e.type)
    expect(types).toContain('error')
    expect(types).toContain('done')
    const errorEvents = emitted.filter((e) => e.type === 'error') as Array<{
      type: 'error'
      content: string
    }>
    expect(errorEvents.some((e) => e.content.includes('Лимит стоимости'))).toBe(true)
  })

  it('ошибка инструмента попадает в trace как tool_result с error', async () => {
    chatState.impl = makeResponses([
      [{ content: toolCallContent('read_file', { path: join(projectDir, 'missing.txt') }) }],
      [{ content: 'Файл не найден.' }]
    ])

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })
    await runner.run([], 'прочитай missing')

    const traceEvents = emitted.filter((e) => e.type === 'trace').map((e) => e.traceEvent!)
    const toolResult = traceEvents.find((t) => t.kind === 'tool_result')
    expect(toolResult).toBeDefined()
    expect(toolResult!.data.ok).toBe(false)
    expect(String(toolResult!.data.error)).toMatch(/Ошибка|ENOENT|не найден/i)
  })

  it('abort прогона пишет run_end со status aborted в trace', async () => {
    const controller = new AbortController()
    chatState.impl = async function* () {
      controller.abort()
      throw new DOMException('Aborted', 'AbortError')
    }

    const runner = new AgentRunner({
      settings: makeSettings(),
      projectPath: projectDir,
      emit,
      signal: controller.signal
    })

    await runner.run([], 'abort test')

    const runEnd = emitted
      .filter((e) => e.type === 'trace')
      .map((e) => e.traceEvent!)
      .find((t) => t.kind === 'run_end')
    expect(runEnd).toBeDefined()
    expect(runEnd!.data.status).toBe('aborted')
  })

  it('невалидный JSON в аргументах tool call не крашит прогон', async () => {
    // parseToolArgs({_raw: '{битый'}) вернёт { _raw } — handler не должен упасть
    chatState.impl = makeResponses([
      // Специально битый JSON — агент должен попробовать запустить инструмент
      // list_directory получит { _raw: '...' } и не найдёт path → вернёт результат или ошибку строкой
      [{ content: '{"name":"list_directory","arguments":"{битый JSON"}' }],
      [{ content: 'Готово.' }]
    ])

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })

    await expect(runner.run([], 'список')).resolves.toBeUndefined()

    const types = emitted.map((e) => e.type)
    expect(types).toContain('done')
  })
})
