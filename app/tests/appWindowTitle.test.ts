import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-window-title-'))
const noGitAppRoot = join(userDataDir, 'no-git-app')

vi.mock('electron', () => ({
  app: {
    getVersion: () => '0.3.51',
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

vi.mock('../electron/main/runtimeBootstrap', () => ({
  isBundledRuntimeFromClone: vi.fn(() => false)
}))

vi.mock('../electron/main/codeviperSource', () => ({
  getCodeViperSourceRoot: () => noGitAppRoot
}))

import { isBundledRuntimeFromClone } from '../electron/main/runtimeBootstrap'
import { getAppCommitShort, getAppWindowTitle } from '../electron/main/appWindowTitle'
import { writeRuntimeBuildHead } from '../electron/main/bundledSourceBuild'

function writeGitHead(repoRoot: string, hash: string): void {
  mkdirSync(join(repoRoot, '.git'), { recursive: true })
  writeFileSync(join(repoRoot, '.git', 'HEAD'), `${hash}\n`, 'utf8')
}

describe('appWindowTitle', () => {
  beforeEach(() => {
    vi.mocked(isBundledRuntimeFromClone).mockReturnValue(false)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    mkdirSync(noGitAppRoot, { recursive: true })
  })

  afterEach(() => {
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(noGitAppRoot, { recursive: true, force: true })
  })

  it('getAppWindowTitle без git показывает только версию', () => {
    expect(getAppWindowTitle()).toBe('CodeViper 0.3.51')
    expect(getAppCommitShort()).toBeNull()
  })

  it('getAppCommitShort читает HEAD из клона при live runtime', async () => {
    vi.mocked(isBundledRuntimeFromClone).mockReturnValue(true)
    const cloneRoot = join(userDataDir, 'source')
    writeGitHead(cloneRoot, 'abcdef1234567890')

    expect(getAppCommitShort()).toBe('abcdef1')
    expect(getAppWindowTitle()).toBe('CodeViper 0.3.51 abcdef1')
  })

  it('getAppCommitShort для live runtime предпочитает маркер сборки', async () => {
    vi.mocked(isBundledRuntimeFromClone).mockReturnValue(true)
    const appRoot = join(userDataDir, 'source', 'app')
    const cloneRoot = join(userDataDir, 'source')
    mkdirSync(join(appRoot, 'out'), { recursive: true })
    writeGitHead(cloneRoot, '1111111111111111')
    await writeRuntimeBuildHead('deadbeefcafebabe', appRoot)

    expect(getAppCommitShort()).toBe('deadbee')
    expect(getAppWindowTitle()).toBe('CodeViper 0.3.51 deadbee')
  })
})
