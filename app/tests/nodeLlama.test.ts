/**
 * Тесты модуля nodeLlama.ts.
 *
 * Юнит-тесты всегда запускаются (node-llama-cpp не нужен).
 * Интеграционные тесты пропускаются без переменной окружения:
 *   TEST_GGUF_PATH=/path/to/model.gguf npm test -- nodeLlama
 */

import { describe, it, expect, afterEach } from 'vitest'
import { loadModel, complete, unloadModel, getHandle } from '../electron/main/nodeLlama'

const GGUF_PATH = process.env.TEST_GGUF_PATH

afterEach(async () => {
  try {
    await unloadModel()
  } catch {
    // нормально — если модель не была загружена
  }
})

// ─── Юнит-тесты (без GGUF-файла) ────────────────────────────────────────────

describe('nodeLlama unit', () => {
  it('getHandle() возвращает null при старте', () => {
    expect(getHandle()).toBeNull()
  })

  it('complete() бросает если модель не загружена', async () => {
    await expect(complete('test')).rejects.toThrow('не загружена')
  })

  it('loadModel() бросает если GGUF-файл не существует', async () => {
    await expect(loadModel('/tmp/__cv_nonexistent__.gguf')).rejects.toThrow('не найден')
  })

  it('getHandle() остаётся null после неудачного loadModel', async () => {
    try {
      await loadModel('/tmp/__cv_nonexistent__.gguf')
    } catch {
      // ожидаемо
    }
    expect(getHandle()).toBeNull()
  })

  it('unloadModel() не бросает если модель не загружена', async () => {
    await expect(unloadModel()).resolves.toBeUndefined()
  })
})

// ─── Интеграционные тесты (нужен TEST_GGUF_PATH) ────────────────────────────

describe.skipIf(!GGUF_PATH)('nodeLlama integration', () => {
  it('loadModel → complete → unload', async () => {
    const handle = await loadModel(GGUF_PATH!)
    expect(handle.modelPath).toBe(GGUF_PATH)
    expect(getHandle()).not.toBeNull()

    const result = await handle.complete('Ответь одним словом: 2+2=', { maxTokens: 8 })
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)

    await handle.unload()
    expect(getHandle()).toBeNull()
  })

  it('повторный loadModel с тем же путём возвращает кешированный handle', async () => {
    const h1 = await loadModel(GGUF_PATH!)
    const h2 = await loadModel(GGUF_PATH!)
    expect(h1).toBe(h2)
  })

  it('complete() бросает после unload()', async () => {
    await loadModel(GGUF_PATH!)
    await unloadModel()
    await expect(complete('test')).rejects.toThrow('не загружена')
  })
})
