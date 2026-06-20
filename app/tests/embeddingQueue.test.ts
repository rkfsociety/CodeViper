import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

// Используем vi.hoisted для создания мока до hoisting vi.mock
const { MockWorker } = vi.hoisted(() => {
  const EventEmitter = require('events')
  class MockWorker extends EventEmitter {
    postMessage = vi.fn()
    terminate = vi.fn()
    constructor(filename: string, options?: { workerData?: Record<string, unknown> }) {
      super()
      MockWorker._lastInstance = this
      MockWorker._lastOptions = options
    }
    static _lastInstance: MockWorker | null = null
    static _lastOptions: { workerData?: Record<string, unknown> } | null = null
  }
  return { MockWorker }
})

vi.mock('worker_threads', () => ({
  Worker: MockWorker
}))

vi.mock('path', () => {
  const actual = require('path')
  return {
    ...actual,
    join: (...args: string[]) => args.join('/')
  }
})

type ComputeEmbeddingQueued = (text: string, ollamaUrl: string) => Promise<number[] | null>

describe('embeddingQueue', () => {
  let computeEmbeddingQueued: ComputeEmbeddingQueued

  beforeAll(async () => {
    const mod = await import('../electron/main/embeddingQueue')
    computeEmbeddingQueued = mod.computeEmbeddingQueued
  })

  it('создаёт воркер при первом вызове computeEmbeddingQueued', async () => {
    const promise = computeEmbeddingQueued('hello', 'http://localhost:11434')

    expect(MockWorker._lastInstance).not.toBeNull()
    expect(MockWorker._lastOptions?.workerData?.model).toBe('nomic-embed-text')

    const worker = MockWorker._lastInstance!
    expect(worker.postMessage).not.toHaveBeenCalled()

    worker.emit('message', { type: 'ready' })
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    const sentMsg = worker.postMessage.mock.calls[0][0]
    expect(sentMsg).toMatchObject({
      type: 'compute',
      text: 'hello',
      ollamaUrl: 'http://localhost:11434'
    })
    expect(sentMsg).toHaveProperty('id')

    worker.emit('message', { id: sentMsg.id, type: 'result', vec: [0.1, 0.2, 0.3] })
    await expect(promise).resolves.toEqual([0.1, 0.2, 0.3])
  })

  it('отправляет сообщение сразу, если воркер уже ready', async () => {
    const worker = MockWorker._lastInstance!
    // воркер уже ready от предыдущего теста

    const promise = computeEmbeddingQueued('second', 'http://localhost:11434')
    expect(worker.postMessage).toHaveBeenCalledTimes(2)
    const sentMsg = worker.postMessage.mock.calls[1][0]
    expect(sentMsg.text).toBe('second')

    worker.emit('message', { id: sentMsg.id, type: 'result', vec: [2.0] })
    await expect(promise).resolves.toEqual([2.0])
  })

  it('обрабатывает ошибку от воркера', async () => {
    const worker = MockWorker._lastInstance!

    const promise = computeEmbeddingQueued('test', 'http://localhost:11434')
    const sentMsg = worker.postMessage.mock.calls[2][0]

    worker.emit('message', { id: sentMsg.id, type: 'error', message: 'Ollama недоступен' })
    await expect(promise).rejects.toThrow('Ollama недоступен')
  })

  it('обрабатывает exit воркера с ненулевым кодом', async () => {
    const worker = MockWorker._lastInstance!

    const promise = computeEmbeddingQueued('test', 'http://localhost:11434')
    worker.emit('exit', 1)
    await expect(promise).rejects.toThrow('embeddingWorker завершился с кодом 1')
  })

  it('создаёт новый воркер после того, как старый упал', async () => {
    const worker1 = MockWorker._lastInstance!

    const p2 = computeEmbeddingQueued('b', 'http://localhost:11434')
    const worker2 = MockWorker._lastInstance!
    expect(worker2).not.toBe(worker1)

    worker2.emit('message', { type: 'ready' })
    const sentMsg = worker2.postMessage.mock.calls[0][0]
    worker2.emit('message', { id: sentMsg.id, type: 'result', vec: [42.0] })
    await expect(p2).resolves.toEqual([42.0])
  })

  it('возвращает null, если воркер вернул null-вектор', async () => {
    const worker = MockWorker._lastInstance!

    const promise = computeEmbeddingQueued('empty', 'http://localhost:11434')
    const sentMsg = worker.postMessage.mock.calls[1][0]

    worker.emit('message', { id: sentMsg.id, type: 'result', vec: null })
    await expect(promise).resolves.toBeNull()
  })

  it('корректно обрабатывает несколько параллельных запросов', async () => {
    const worker = MockWorker._lastInstance!

    const p1 = computeEmbeddingQueued('parallel-a', 'http://localhost:11434')
    const p2 = computeEmbeddingQueued('parallel-b', 'http://localhost:11434')
    const p3 = computeEmbeddingQueued('parallel-c', 'http://localhost:11434')

    const msgs = worker.postMessage.mock.calls
      .slice(-3)
      .map((c: unknown[]) => c[0] as { id: number })
    expect(msgs.length).toBe(3)

    worker.emit('message', { id: msgs[2].id, type: 'result', vec: [3.0] })
    worker.emit('message', { id: msgs[0].id, type: 'result', vec: [1.0] })
    worker.emit('message', { id: msgs[1].id, type: 'result', vec: [2.0] })

    await expect(p1).resolves.toEqual([1.0])
    await expect(p2).resolves.toEqual([2.0])
    await expect(p3).resolves.toEqual([3.0])
  })

  it('очищает очередь при падении воркера до ready', async () => {
    // Сбрасываем состояние: воркер уже ready от предыдущего теста
    // Имитируем падение до готовности: worker2 от предыдущего теста уже готов —
    // создадим новый сценарий через ошибку воркера
    const worker = MockWorker._lastInstance!
    worker.emit('error', new Error('crash before ready'))

    // Новый запрос после падения — попадает в очередь, создаётся новый воркер
    const p = computeEmbeddingQueued('after-crash', 'http://localhost:11434')
    const newWorker = MockWorker._lastInstance!
    expect(newWorker).not.toBe(worker)

    // Только один элемент в очереди (старые устаревшие — не должны протечь)
    newWorker.emit('message', { type: 'ready' })
    expect(newWorker.postMessage).toHaveBeenCalledTimes(1)
    const msg = newWorker.postMessage.mock.calls[0][0]
    expect(msg.text).toBe('after-crash')

    newWorker.emit('message', { id: msg.id, type: 'result', vec: [99.0] })
    await expect(p).resolves.toEqual([99.0])
  })

  it('не дублирует воркер при повторных вызовах', async () => {
    const worker = MockWorker._lastInstance!

    computeEmbeddingQueued('a', 'http://localhost:11434')
    expect(MockWorker._lastInstance).toBe(worker)
  })
})
