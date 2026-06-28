import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-runtime-update-state-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import {
  clearRuntimeUpdateStateForTests,
  recordRuntimeAppliedHead,
  recordRuntimeDismissedHead,
  shouldSkipRuntimeUpdateBanner
} from '../electron/main/runtimeUpdateState'

describe('runtimeUpdateState', () => {
  beforeEach(async () => {
    await clearRuntimeUpdateStateForTests()
  })

  afterEach(async () => {
    await clearRuntimeUpdateStateForTests()
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('shouldSkipRuntimeUpdateBanner: false без записи', async () => {
    expect(await shouldSkipRuntimeUpdateBanner('abc123')).toBe(false)
  })

  it('recordRuntimeAppliedHead блокирует повторный баннер для того же HEAD', async () => {
    await recordRuntimeAppliedHead('abc123def456')
    expect(await shouldSkipRuntimeUpdateBanner('abc123def456')).toBe(true)
    expect(await shouldSkipRuntimeUpdateBanner('other')).toBe(false)
  })

  it('recordRuntimeDismissedHead блокирует баннер до нового HEAD', async () => {
    await recordRuntimeDismissedHead('deadbeef')
    expect(await shouldSkipRuntimeUpdateBanner('deadbeef')).toBe(true)
  })

  it('appliedHead сбрасывает dismissedHead', async () => {
    await recordRuntimeDismissedHead('abc')
    await recordRuntimeAppliedHead('abc')
    expect(await shouldSkipRuntimeUpdateBanner('abc')).toBe(true)
  })
})
