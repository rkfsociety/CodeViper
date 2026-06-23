import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('systeminformation', () => ({
  default: {
    currentLoad: vi.fn(),
    graphics: vi.fn()
  }
}))

import si from 'systeminformation'
import {
  getP2pLoadPauseReason,
  getP2pPauseReason,
  getSystemStats,
  isP2pPausedDueToLoad
} from '../electron/main/systemStats'
import { P2P_PAUSE_CPU_THRESHOLD, P2P_PAUSE_GPU_THRESHOLD } from '../shared/constants'

const mockSi = vi.mocked(si)

function mockLoad(cpu: number, gpu: number | null): void {
  mockSi.currentLoad.mockResolvedValue({ currentLoad: cpu } as Awaited<
    ReturnType<typeof si.currentLoad>
  >)
  mockSi.graphics.mockResolvedValue({
    controllers: gpu == null ? [] : [{ utilizationGpu: gpu }]
  } as Awaited<ReturnType<typeof si.graphics>>)
}

describe('getP2pPauseReason', () => {
  it('без паузы при нагрузке ниже порогов', () => {
    expect(
      getP2pPauseReason({ cpu: P2P_PAUSE_CPU_THRESHOLD, gpu: P2P_PAUSE_GPU_THRESHOLD })
    ).toBeNull()
    expect(getP2pPauseReason({ cpu: 10, gpu: 15 })).toBeNull()
  })

  it('пауза при CPU выше порога', () => {
    const reason = getP2pPauseReason({ cpu: P2P_PAUSE_CPU_THRESHOLD + 1, gpu: 0 })
    expect(reason).toContain('CPU')
    expect(isP2pPausedDueToLoad({ cpu: 20, gpu: null })).toBe(true)
  })

  it('пауза при GPU выше порога', () => {
    const reason = getP2pPauseReason({ cpu: 5, gpu: P2P_PAUSE_GPU_THRESHOLD + 1 })
    expect(reason).toContain('GPU')
  })

  it('игнорирует GPU, если метрика недоступна (null)', () => {
    expect(getP2pPauseReason({ cpu: 5, gpu: null })).toBeNull()
  })
})

describe('getP2pLoadPauseReason (systeminformation mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('читает CPU/GPU через systeminformation', async () => {
    mockLoad(10, 12)
    await expect(getP2pLoadPauseReason()).resolves.toBeNull()
    expect(mockSi.currentLoad).toHaveBeenCalled()
    expect(mockSi.graphics).toHaveBeenCalled()
  })

  it('возвращает причину при высокой CPU', async () => {
    mockLoad(25, 5)
    const reason = await getP2pLoadPauseReason()
    expect(reason).toContain('CPU 25%')
  })

  it('возвращает причину при высокой GPU', async () => {
    mockLoad(5, 45)
    const reason = await getP2pLoadPauseReason()
    expect(reason).toContain('GPU 45%')
  })

  it('getSystemStats округляет значения', async () => {
    mockLoad(14.6, 19.4)
    await expect(getSystemStats()).resolves.toEqual({ cpu: 15, gpu: 19 })
  })
})
