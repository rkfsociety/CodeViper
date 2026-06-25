/**
 * Нагрузочные тесты CodeViper.
 *
 * Сценарии:
 *   1. 60 сообщений подряд в одном чате — проверяем отсутствие утечки памяти
 *   2. 10 параллельных чатов × 5 сообщений — агенты не мешают друг другу
 *   3. Длинная история (400 сообщений) — агент стартует без OOM и не зависает
 *   4. Отчёт о памяти main-процесса (heapUsed до/после каждого сценария)
 *
 * Измерение памяти рендерера (Electron BrowserWindow) требует E2E-сессии;
 * здесь измеряется Node.js heap main-процесса через process.memoryUsage().
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── Зафиксировать chatState до vi.mock() ─────────────────────────────────────
const chatState = vi.hoisted(() => ({
  impl: null as null | (() => AsyncGenerator<{ content: string }>)
}))

// ── Электрон ─────────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/load' }
}))

// ── Логгер ────────────────────────────────────────────────────────────────────
vi.mock('../electron/main/agentLogger', () => ({
  agentLogger: { write: vi.fn().mockResolvedValue(undefined) }
}))

// ── agentContext ───────────────────────────────────────────────────────────────
vi.mock('../electron/main/agentContext', async (importOriginal) => {
  const original = await importOriginal<typeof import('../electron/main/agentContext')>()
  return {
    ...original,
    prepareAgentRunContext: vi.fn().mockResolvedValue({
      messages: [{ role: 'system', content: 'system' }],
      preview: { sections: [], totalChars: 50, contextUsagePercent: 1, historySummarized: false }
    })
  }
})

// ── selfCommit ────────────────────────────────────────────────────────────────
vi.mock('../electron/main/selfCommit', () => ({
  commitAndPushSelfEdits: vi.fn().mockResolvedValue({ ok: true, message: 'ok' })
}))

// ── ModelRuntime ───────────────────────────────────────────────────────────────
vi.mock('../electron/main/modelRuntime', () => {
  function MockModelRuntime() {
    /* */
  }
  MockModelRuntime.prototype.getModelPlacement = () => Promise.resolve('gpu')
  MockModelRuntime.prototype.chat = async function* () {
    if (!chatState.impl) throw new Error('chatState.impl не задан')
    yield* chatState.impl()
  }
  MockModelRuntime.prototype.ping = () => Promise.resolve(true)
  MockModelRuntime.prototype.listModels = () => Promise.resolve([{ name: 'test-model' }])
  return {
    ModelRuntime: MockModelRuntime,
    formatModelSwitchMessage: () => '',
    prepareOllamaModel: () => Promise.resolve({ unloaded: [] }),
    listLoadedOllamaModels: () => Promise.resolve([]),
    getModelPlacement: () => Promise.resolve('gpu')
  }
})

import { AgentRunner } from '../electron/main/agent'
import type { AgentSettings, AgentStreamPayload, ChatMessage } from '../src/types'

// ── Хелперы ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return { model: 'test-model', ollamaUrl: 'http://localhost:11434', ...overrides }
}

/** Простой ответ без tool call — агент сразу завершает шаг */
function simpleReply(text = 'OK'): () => AsyncGenerator<{ content: string }> {
  return async function* () {
    yield { content: text }
  }
}

/** Создать историю из N сообщений пользователь/ассистент */
function makeHistory(n: number): ChatMessage[] {
  const msgs: ChatMessage[] = []
  for (let i = 0; i < n; i++) {
    msgs.push({ id: `u${i}`, role: 'user', content: `Сообщение ${i}`, timestamp: i * 1000 })
    msgs.push({ id: `a${i}`, role: 'assistant', content: `Ответ ${i}`, timestamp: i * 1000 + 500 })
  }
  return msgs
}

/** Снять отчёт о памяти — возвращает heapUsed в МБ */
function heapMB(): number {
  if (typeof globalThis.gc === 'function') globalThis.gc()
  return process.memoryUsage().heapUsed / 1024 / 1024
}

/** Запустить агента и дождаться done */
async function runOnce(
  runner: AgentRunner,
  history: ChatMessage[],
  msg: string
): Promise<AgentStreamPayload[]> {
  const events: AgentStreamPayload[] = []
  await (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
    history,
    msg
  )
  return events
}

// ── Тесты ─────────────────────────────────────────────────────────────────────

describe('Нагрузка: 60 сообщений подряд', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-load-seq-'))
    chatState.impl = simpleReply('Ответ агента')
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    vi.clearAllMocks()
    chatState.impl = null
  })

  it('60 прогонов — heap не растёт более чем на 100 МБ', async () => {
    const memBefore = heapMB()
    const history: ChatMessage[] = []
    const emit = vi.fn()

    for (let i = 0; i < 60; i++) {
      const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })
      await (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
        history,
        `Задача ${i}`
      )
    }

    const memAfter = heapMB()
    const deltaMB = memAfter - memBefore

    console.log(
      `[load] seq: before=${memBefore.toFixed(1)} MB  after=${memAfter.toFixed(1)} MB  delta=${deltaMB.toFixed(1)} MB`
    )
    expect(deltaMB).toBeLessThan(100)
  }, 60_000)

  it('60 прогонов — все завершаются без исключений', async () => {
    const emit = vi.fn()
    const errors: string[] = []

    for (let i = 0; i < 60; i++) {
      try {
        const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })
        await (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
          [],
          `Задача ${i}`
        )
      } catch (e) {
        errors.push(String(e))
      }
    }

    expect(errors).toHaveLength(0)
  }, 60_000)
})

describe('Нагрузка: 10 параллельных чатов', () => {
  let projectDirs: string[]

  beforeEach(() => {
    projectDirs = Array.from({ length: 10 }, () => mkdtempSync(join(tmpdir(), 'cv-load-par-')))
    chatState.impl = simpleReply('Параллельный ответ')
  })

  afterEach(() => {
    projectDirs.forEach((d) => rmSync(d, { recursive: true, force: true }))
    vi.clearAllMocks()
    chatState.impl = null
  })

  it('10 агентов × 5 сообщений параллельно — все завершаются успешно', async () => {
    const memBefore = heapMB()

    const tasks = projectDirs.map(async (dir, idx) => {
      const emit = vi.fn()
      for (let msg = 0; msg < 5; msg++) {
        const runner = new AgentRunner({ settings: makeSettings(), projectPath: dir, emit })
        await (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
          [],
          `Чат ${idx}, сообщение ${msg}`
        )
      }
      return idx
    })

    const results = await Promise.all(tasks)
    const memAfter = heapMB()
    const deltaMB = memAfter - memBefore

    console.log(
      `[load] par: before=${memBefore.toFixed(1)} MB  after=${memAfter.toFixed(1)} MB  delta=${deltaMB.toFixed(1)} MB`
    )

    expect(results).toHaveLength(10)
    expect(deltaMB).toBeLessThan(150)
  }, 120_000)
})

describe('Нагрузка: длинная история', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-load-hist-'))
    chatState.impl = simpleReply('Ответ на длинную историю')
  })

  afterEach(() => {
    rmSync(projectDir, { recursive: true, force: true })
    vi.clearAllMocks()
    chatState.impl = null
  })

  it('история из 200 пар сообщений (400 записей) — агент запускается без OOM', async () => {
    const history = makeHistory(200) // 400 записей
    const memBefore = heapMB()
    const emit = vi.fn()

    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })
    await expect(
      (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
        history,
        'Ответь на основе истории'
      )
    ).resolves.toBeUndefined()

    const memAfter = heapMB()
    const deltaMB = memAfter - memBefore

    console.log(
      `[load] hist400: before=${memBefore.toFixed(1)} MB  after=${memAfter.toFixed(1)} MB  delta=${deltaMB.toFixed(1)} MB`
    )
    expect(deltaMB).toBeLessThan(50)
  }, 30_000)

  it('история из 400 пар (800 записей) — агент не зависает, завершается за разумное время', async () => {
    const history = makeHistory(400) // 800 записей — выше MAX_MESSAGES_PER_CHAT, но agentContext замокан
    const emit = vi.fn()

    const start = Date.now()
    const runner = new AgentRunner({ settings: makeSettings(), projectPath: projectDir, emit })
    await (runner as unknown as { run: (h: ChatMessage[], m: string) => Promise<void> }).run(
      history,
      'Ответь'
    )
    const elapsedMs = Date.now() - start

    console.log(`[load] hist800: elapsed=${elapsedMs} ms`)
    expect(elapsedMs).toBeLessThan(10_000)
  }, 30_000)
})

describe('Отчёт о памяти main-процесса', () => {
  it('снять baseline метрики памяти', () => {
    const m = process.memoryUsage()
    console.log(
      `[memory] heapUsed=${(m.heapUsed / 1024 / 1024).toFixed(1)} MB` +
        `  heapTotal=${(m.heapTotal / 1024 / 1024).toFixed(1)} MB` +
        `  rss=${(m.rss / 1024 / 1024).toFixed(1)} MB` +
        `  external=${(m.external / 1024 / 1024).toFixed(1)} MB`
    )
    // Тест всегда проходит — он только логирует метрики
    expect(m.heapUsed).toBeGreaterThan(0)
  })
})
