import { describe, it, expect, vi, beforeEach } from 'vitest'
import { analyze } from '../electron/main/orchestratorModel'

// vi.mock поднимается (hoist) до импортов — мок применяется раньше, чем
// orchestratorModel.ts импортирует nodeLlama.ts
vi.mock('../electron/main/nodeLlama', () => ({
  loadModel: vi.fn(),
  unloadModel: vi.fn().mockResolvedValue(undefined)
}))

import { loadModel } from '../electron/main/nodeLlama'

// ─── Вспомогательные ────────────────────────────────────────────────────────

const FAKE_PATH = '/fake/model.gguf'
const mockComplete = vi.fn()

function setupMock(response: string) {
  mockComplete.mockResolvedValue(response)
  vi.mocked(loadModel).mockResolvedValue({
    modelPath: FAKE_PATH,
    complete: mockComplete,
    unload: vi.fn().mockResolvedValue(undefined)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Тесты ──────────────────────────────────────────────────────────────────

describe('orchestratorModel.analyze', () => {
  it('парсит валидный JSON без обёртки', async () => {
    setupMock(
      '{"plan":"1. читать файл 2. добавить лог","rephrased":"добавь логирование","isComplex":false}'
    )
    const r = await analyze('добавь лог', FAKE_PATH)
    expect(r.plan).toBe('1. читать файл 2. добавить лог')
    expect(r.rephrased).toBe('добавь логирование')
    expect(r.isComplex).toBe(false)
  })

  it('парсит JSON с prefix-текстом (модель добавила пояснение)', async () => {
    setupMock('Here is the analysis:\n{"plan":"шаги","rephrased":"задача","isComplex":true}')
    const r = await analyze('сложная задача', FAKE_PATH)
    expect(r.plan).toBe('шаги')
    expect(r.isComplex).toBe(true)
  })

  it('парсит JSON в markdown-блоке', async () => {
    setupMock('```json\n{"plan":"план","rephrased":"переформулировка","isComplex":false}\n```')
    const r = await analyze('задача', FAKE_PATH)
    expect(r.plan).toBe('план')
    expect(r.rephrased).toBe('переформулировка')
  })

  it('приводит isComplex="true" (строка) к boolean', async () => {
    setupMock('{"plan":"","rephrased":"","isComplex":"true"}')
    const r = await analyze('задача', FAKE_PATH)
    expect(r.isComplex).toBe(true)
  })

  it('возвращает fallback если модель вернула не JSON', async () => {
    setupMock('Sorry, I cannot help with that.')
    const r = await analyze('запрос', FAKE_PATH)
    expect(r.isComplex).toBe(false)
    expect(r.plan).toBe('')
    expect(r.rephrased).toContain('Sorry')
  })

  it('rephrased из fallback обрезается до 300 символов', async () => {
    setupMock('x'.repeat(500))
    const r = await analyze('запрос', FAKE_PATH)
    expect(r.rephrased.length).toBeLessThanOrEqual(300)
  })

  it('вызывает loadModel с переданным modelPath', async () => {
    setupMock('{"plan":"","rephrased":"","isComplex":false}')
    await analyze('тест', '/custom/path.gguf')
    expect(vi.mocked(loadModel)).toHaveBeenCalledWith('/custom/path.gguf')
  })

  it('передаёт сообщение в промпт complete()', async () => {
    setupMock('{"plan":"","rephrased":"","isComplex":false}')
    await analyze('мой запрос', FAKE_PATH)
    const [prompt] = mockComplete.mock.calls[0] as [string]
    expect(prompt).toContain('мой запрос')
  })

  it('complete() вызывается с низкой temperature', async () => {
    setupMock('{"plan":"","rephrased":"","isComplex":false}')
    await analyze('тест', FAKE_PATH)
    const [, opts] = mockComplete.mock.calls[0] as [string, { temperature?: number }]
    expect(opts.temperature).toBeGreaterThan(0)
    expect(opts.temperature).toBeLessThan(0.5)
  })

  it('пустые строки plan/rephrased при неполном JSON', async () => {
    setupMock('{"isComplex":false}')
    const r = await analyze('запрос', FAKE_PATH)
    expect(r.plan).toBe('')
    expect(r.rephrased).toBe('')
    expect(r.isComplex).toBe(false)
  })
})
