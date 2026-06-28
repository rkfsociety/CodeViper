import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, utimesSync, readFileSync } from 'fs'
import { tmpdir } from 'os'

const userDataDir = mkdtempSync(join(tmpdir(), 'cv-bundled-build-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? userDataDir : process.cwd())
  }
}))

import {
  buildBundledSourceRuntime,
  ensureRuntimeBuildHeadRecorded,
  getBundledRuntimeMainPath,
  getRuntimeBuildHead,
  isBundledRuntimeMainStale,
  needsBundledSourceNpmInstall,
  setBundledSourceCommandRunnerForTests,
  shouldBuildBundledSourceAfterSync,
  writeRuntimeBuildHead
} from '../electron/main/bundledSourceBuild'

function setupMinimalApp(appRoot: string): void {
  mkdirSync(join(appRoot, 'electron', 'main'), { recursive: true })
  writeFileSync(join(appRoot, 'package.json'), '{"name":"codeviper-clone"}', 'utf8')
  writeFileSync(join(appRoot, 'electron', 'main', 'agent.ts'), 'export {}\n', 'utf8')
}

describe('bundledSourceBuild', () => {
  const appRoot = join(userDataDir, 'source', 'app')

  beforeEach(() => {
    setBundledSourceCommandRunnerForTests(null)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(join(userDataDir, 'logs'), { recursive: true, force: true })
  })

  afterEach(() => {
    setBundledSourceCommandRunnerForTests(null)
    rmSync(join(userDataDir, 'source'), { recursive: true, force: true })
    rmSync(join(userDataDir, 'logs'), { recursive: true, force: true })
  })

  it('isBundledRuntimeMainStale: true без out/main/index.js', () => {
    setupMinimalApp(appRoot)
    expect(isBundledRuntimeMainStale(appRoot)).toBe(true)
  })

  it('isBundledRuntimeMainStale: true если исходник новее out/main', () => {
    setupMinimalApp(appRoot)
    const mainOut = join(appRoot, 'out', 'main')
    mkdirSync(mainOut, { recursive: true })
    const outFile = join(mainOut, 'index.js')
    writeFileSync(outFile, 'old', 'utf8')
    const old = Date.now() - 60_000
    utimesSync(outFile, old / 1000, old / 1000)

    writeFileSync(join(appRoot, 'electron', 'main', 'agent.ts'), 'export const x = 1\n', 'utf8')

    expect(isBundledRuntimeMainStale(appRoot)).toBe(true)
  })

  it('needsBundledSourceNpmInstall: true без node_modules', () => {
    setupMinimalApp(appRoot)
    writeFileSync(join(appRoot, 'package-lock.json'), '{}\n', 'utf8')
    expect(needsBundledSourceNpmInstall(appRoot)).toBe(true)
  })

  it('shouldBuildBundledSourceAfterSync при appDirChanged', () => {
    setupMinimalApp(appRoot)
    expect(shouldBuildBundledSourceAfterSync({ updated: true, appDirChanged: true })).toBe(true)
  })

  it('shouldBuildBundledSourceAfterSync: false если out собран для текущего HEAD', async () => {
    setupMinimalApp(appRoot)
    const mainOut = join(appRoot, 'out', 'main')
    mkdirSync(mainOut, { recursive: true })
    writeFileSync(join(mainOut, 'index.js'), 'built\n', 'utf8')
    const old = Date.now() - 60_000
    utimesSync(join(mainOut, 'index.js'), old / 1000, old / 1000)
    writeFileSync(join(appRoot, 'electron', 'main', 'agent.ts'), 'export const x = 1\n', 'utf8')

    await writeRuntimeBuildHead('abc123def456', appRoot)
    expect(
      shouldBuildBundledSourceAfterSync({
        updated: false,
        localHead: 'abc123def456'
      })
    ).toBe(false)
  })

  it('ensureRuntimeBuildHeadRecorded мигрирует маркер без пересборки', async () => {
    setupMinimalApp(appRoot)
    mkdirSync(join(appRoot, 'out', 'main'), { recursive: true })
    writeFileSync(join(appRoot, 'out', 'main', 'index.js'), 'ok\n', 'utf8')

    await ensureRuntimeBuildHeadRecorded('deadbeef', appRoot)
    expect(getRuntimeBuildHead(appRoot)).toBe('deadbeef')
  })

  it('build обновляет out/main/index.js после изменения в клоне', async () => {
    setupMinimalApp(appRoot)
    const mainOut = getBundledRuntimeMainPath()
    expect(isBundledRuntimeMainStale(appRoot)).toBe(true)

    const commands: string[] = []
    setBundledSourceCommandRunnerForTests(async (root, command) => {
      commands.push(command)
      if (command === 'npm install') {
        mkdirSync(join(root, 'node_modules'), { recursive: true })
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      if (command === 'npm run build') {
        mkdirSync(join(root, 'out', 'main'), { recursive: true })
        writeFileSync(join(root, 'out', 'main', 'index.js'), 'built-runtime\n', 'utf8')
        return { stdout: 'built', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: 'unexpected', exitCode: 1 }
    })

    const result = await buildBundledSourceRuntime(appRoot)
    expect(result.built).toBe(true)
    expect(commands).toContain('npm install')
    expect(commands).toContain('npm run build')
    expect(readFileSync(mainOut, 'utf8')).toBe('built-runtime\n')
    expect(isBundledRuntimeMainStale(appRoot)).toBe(false)
  })

  it('build пропускает npm install если node_modules актуален', async () => {
    setupMinimalApp(appRoot)
    mkdirSync(join(appRoot, 'node_modules'), { recursive: true })
    writeFileSync(join(appRoot, 'package-lock.json'), '{}\n', 'utf8')
    const now = Date.now()
    utimesSync(join(appRoot, 'package-lock.json'), now / 1000, now / 1000)
    utimesSync(join(appRoot, 'node_modules'), now / 1000, now / 1000)

    const commands: string[] = []
    setBundledSourceCommandRunnerForTests(async (root, command) => {
      commands.push(command)
      if (command === 'npm run build') {
        mkdirSync(join(root, 'out', 'main'), { recursive: true })
        writeFileSync(join(root, 'out', 'main', 'index.js'), 'ok\n', 'utf8')
        return { stdout: '', stderr: '', exitCode: 0 }
      }
      return { stdout: '', stderr: '', exitCode: 0 }
    })

    await buildBundledSourceRuntime(appRoot)
    expect(commands).not.toContain('npm install')
    expect(commands).toContain('npm run build')
  })
})
