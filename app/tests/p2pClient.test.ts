import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../electron/main/systemStats', () => ({
  getP2pLoadPauseReason: vi.fn()
}))

import { getP2pLoadPauseReason } from '../electron/main/systemStats'
import { tryAcceptIncomingP2pTask } from '../electron/main/p2pClient'
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
