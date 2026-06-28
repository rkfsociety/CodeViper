import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sendMock = vi.fn()
const relaunchMock = vi.fn()
const exitMock = vi.fn()
const shouldSkipMock = vi.fn().mockResolvedValue(false)

vi.mock('electron', () => ({
  app: {
    isPackaged: true,
    relaunch: (...args: unknown[]) => relaunchMock(...args),
    exit: (...args: unknown[]) => exitMock(...args),
    getPath: () => '/tmp/runtime-update-test'
  },
  BrowserWindow: {
    getAllWindows: () => []
  }
}))

vi.mock('fs/promises', () => ({
  appendFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../electron/main/runtimeUpdateState', () => ({
  shouldSkipRuntimeUpdateBanner: (...args: unknown[]) => shouldSkipMock(...args),
  recordRuntimeAppliedHead: vi.fn().mockResolvedValue(undefined),
  recordRuntimeDismissedHead: vi.fn().mockResolvedValue(undefined)
}))

import {
  buildRuntimeUpdateInfo,
  clearRuntimeUpdatePending,
  dismissRuntimeUpdate,
  isRuntimeUpdatePending,
  markRuntimeUpdateReady,
  notifyRuntimeUpdateReady,
  relaunchForRuntimeUpdate,
  startRuntimeUpdateNotifier
} from '../electron/main/runtimeUpdate'
import { UpdateInfoSchema } from '../shared/updateInfo'
import { IPC } from '../shared/ipcContracts'

describe('runtimeUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    shouldSkipMock.mockResolvedValue(false)
    clearRuntimeUpdatePending()
  })

  afterEach(() => {
    clearRuntimeUpdatePending()
  })

  it('buildRuntimeUpdateInfo валиден для UpdateInfoSchema', () => {
    const info = buildRuntimeUpdateInfo('abc123def456')
    expect(UpdateInfoSchema.parse(info)).toEqual({
      source: 'runtime',
      ready: true,
      localHead: 'abc123def456'
    })
  })

  it('markRuntimeUpdateReady устанавливает pending и шлёт runtime-update-ready', async () => {
    const wc = { isDestroyed: () => false, send: sendMock } as never
    startRuntimeUpdateNotifier(wc)

    markRuntimeUpdateReady('deadbeef')
    await vi.waitFor(() => expect(isRuntimeUpdatePending()).toBe(true))

    expect(sendMock).toHaveBeenCalledWith(IPC.RUNTIME_UPDATE_READY, {
      source: 'runtime',
      ready: true,
      localHead: 'deadbeef'
    })
  })

  it('markRuntimeUpdateReady пропускает баннер если HEAD уже применён', async () => {
    shouldSkipMock.mockResolvedValue(true)
    const wc = { isDestroyed: () => false, send: sendMock } as never
    startRuntimeUpdateNotifier(wc)

    markRuntimeUpdateReady('deadbeef')
    await new Promise((r) => setTimeout(r, 20))

    expect(isRuntimeUpdatePending()).toBe(false)
    expect(sendMock).not.toHaveBeenCalled()
  })

  it('notifyRuntimeUpdateReady шлёт update-available и runtime-update-ready', () => {
    const wc = { isDestroyed: () => false, send: sendMock } as never
    notifyRuntimeUpdateReady(wc, 'cafebabe')
    expect(sendMock).toHaveBeenCalledWith(IPC.UPDATE_AVAILABLE, {
      source: 'runtime',
      ready: true,
      localHead: 'cafebabe'
    })
    expect(sendMock).toHaveBeenCalledWith(IPC.RUNTIME_UPDATE_READY, {
      source: 'runtime',
      ready: true,
      localHead: 'cafebabe'
    })
  })

  it('dismissRuntimeUpdate сбрасывает pending', async () => {
    markRuntimeUpdateReady('abc')
    await vi.waitFor(() => expect(isRuntimeUpdatePending()).toBe(true))
    dismissRuntimeUpdate()
    expect(isRuntimeUpdatePending()).toBe(false)
  })

  it('relaunchForRuntimeUpdate вызывает app.relaunch и exit', async () => {
    markRuntimeUpdateReady('abc')
    await vi.waitFor(() => expect(isRuntimeUpdatePending()).toBe(true))
    await relaunchForRuntimeUpdate()
    expect(isRuntimeUpdatePending()).toBe(false)
    expect(relaunchMock).toHaveBeenCalled()
    expect(exitMock).toHaveBeenCalledWith(0)
  })

  it('consumeRuntimeUpdateForShellInstall сбрасывает pending и записывает HEAD', async () => {
    const { consumeRuntimeUpdateForShellInstall } = await import('../electron/main/runtimeUpdate')
    const { recordRuntimeAppliedHead } = await import('../electron/main/runtimeUpdateState')

    markRuntimeUpdateReady('abc123')
    await vi.waitFor(() => expect(isRuntimeUpdatePending()).toBe(true))

    consumeRuntimeUpdateForShellInstall()
    expect(isRuntimeUpdatePending()).toBe(false)
    await vi.waitFor(() => expect(recordRuntimeAppliedHead).toHaveBeenCalledWith('abc123'))
  })
})
