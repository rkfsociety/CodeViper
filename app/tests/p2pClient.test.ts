import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../electron/main/systemStats', () => ({
  getP2pLoadPauseReason: vi.fn()
}))

import { getP2pLoadPauseReason } from '../electron/main/systemStats'
import {
  acquireP2pTaskSlot,
  getP2pTaskQueueStats,
  getP2pWssConnectionState,
  isP2pWssOffline,
  releaseP2pTaskSlot,
  resetP2pTaskQueueForTests,
  resetP2pWssStateForTests,
  reserveIncomingP2pTask,
  syncP2pWssConnection,
  tryAcceptIncomingP2pTask
} from '../electron/main/p2pClient'
import { P2P_MAX_CONCURRENT_TASKS, P2P_QUEUE_WAIT_TIMEOUT_MS } from '../shared/constants'
import type { AgentSettings } from '../src/types'

const mockPause = vi.mocked(getP2pLoadPauseReason)

const baseSettings: AgentSettings = {
  model: 'qwen2.5-coder:7b',
  ollamaUrl: 'http://127.0.0.1:11434',
  shareCompute: true
}

const task = { id: 'task-1', prompt: 'Привет' }

describe('tryAcceptIncomingP2pTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPause.mockResolvedValue(null)
  })

  it('отклоняет, если shareCompute выключен', async () => {
    const result = await tryAcceptIncomingP2pTask({ ...baseSettings, shareCompute: false }, task)
    expect(result).toEqual({
      accepted: false,
      paused: false,
      message: 'Режим «Поделиться мощностью» выключен'
    })
    expect(mockPause).not.toHaveBeenCalled()
  })

  it('ставит на паузу при высокой нагрузке', async () => {
    mockPause.mockResolvedValue('CPU 30% (лимит 15%)')
    const result = await tryAcceptIncomingP2pTask(baseSettings, task)
    expect(result.accepted).toBe(false)
    expect(result.paused).toBe(true)
    expect(result.message).toContain('P2P на паузе')
  })

  it('принимает задачу при низкой нагрузке', async () => {
    const result = await tryAcceptIncomingP2pTask(baseSettings, task)
    expect(result).toEqual({
      accepted: true,
      paused: false,
      message: 'можно принять задачу'
    })
  })
})

describe('acquireP2pTaskSlot / releaseP2pTaskSlot', () => {
  beforeEach(() => {
    resetP2pTaskQueueForTests()
  })

  it('разрешает до 3 параллельных задач', async () => {
    await expect(acquireP2pTaskSlot('t1')).resolves.toMatchObject({ acquired: true })
    await expect(acquireP2pTaskSlot('t2')).resolves.toMatchObject({ acquired: true })
    await expect(acquireP2pTaskSlot('t3')).resolves.toMatchObject({ acquired: true })
    expect(getP2pTaskQueueStats()).toEqual({ active: 3, queued: 0 })
  })

  it('отклоняет 4-ю задачу с 503 после таймаута очереди', async () => {
    vi.useFakeTimers()

    await acquireP2pTaskSlot('t1')
    await acquireP2pTaskSlot('t2')
    await acquireP2pTaskSlot('t3')

    const fourth = acquireP2pTaskSlot('t4')
    expect(getP2pTaskQueueStats()).toEqual({ active: 3, queued: 1 })

    await vi.advanceTimersByTimeAsync(P2P_QUEUE_WAIT_TIMEOUT_MS)

    await expect(fourth).resolves.toEqual({
      acquired: false,
      statusCode: 503,
      message: expect.stringContaining(String(P2P_MAX_CONCURRENT_TASKS))
    })
    expect(getP2pTaskQueueStats()).toEqual({ active: 3, queued: 0 })

    vi.useRealTimers()
  })

  it('передаёт слот следующей задаче в очереди при release', async () => {
    await acquireP2pTaskSlot('t1')
    await acquireP2pTaskSlot('t2')
    await acquireP2pTaskSlot('t3')

    const fourth = acquireP2pTaskSlot('t4')
    releaseP2pTaskSlot()

    await expect(fourth).resolves.toMatchObject({ acquired: true })
    expect(getP2pTaskQueueStats()).toEqual({ active: 3, queued: 0 })
  })
})

describe('reserveIncomingP2pTask', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetP2pTaskQueueForTests()
    mockPause.mockResolvedValue(null)
  })

  it('возвращает 503 при переполнении очереди', async () => {
    vi.useFakeTimers()

    for (let i = 1; i <= P2P_MAX_CONCURRENT_TASKS; i++) {
      await acquireP2pTaskSlot(`busy-${i}`)
    }

    const reserve = reserveIncomingP2pTask(baseSettings, { id: 't4', prompt: 'x' })
    await vi.advanceTimersByTimeAsync(P2P_QUEUE_WAIT_TIMEOUT_MS)

    const result = await reserve
    expect(result.accepted).toBe(false)
    expect(result.statusCode).toBe(503)

    vi.useRealTimers()
  })
})

describe('syncP2pWssConnection', () => {
  beforeEach(() => {
    resetP2pWssStateForTests()
  })

  it('idle без shareCompute', () => {
    syncP2pWssConnection({ ...baseSettings, shareCompute: false, p2pNodeId: 'node-1' })
    expect(getP2pWssConnectionState()).toBe('idle')
    expect(isP2pWssOffline()).toBe(false)
  })

  it('idle без p2pNodeId', () => {
    syncP2pWssConnection({
      ...baseSettings,
      shareCompute: true,
      p2pServerUrl: 'http://localhost:4242',
      p2pAuthToken: 'token'
    })
    expect(getP2pWssConnectionState()).toBe('idle')
  })
})
