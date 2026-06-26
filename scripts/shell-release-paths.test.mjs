import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { classifyChangedFiles, isShellPath, isRuntimeOnlyPath } from './shell-release-paths.mjs'

describe('shell-release-paths', () => {
  it('agent handler — runtime only', () => {
    assert.equal(isRuntimeOnlyPath('app/electron/main/agentHandlersProjectFile.ts'), true)
    assert.equal(isShellPath('app/electron/main/agentHandlersProjectFile.ts'), false)
  })

  it('renderer — shell', () => {
    assert.equal(isShellPath('app/src/components/TracePanel.tsx'), true)
  })

  it('docs — ignored', () => {
    const r = classifyChangedFiles(['docs/development.md', 'ROADMAP.md'])
    assert.equal(r.needed, false)
    assert.equal(r.shellFiles.length, 0)
  })

  it('только handlers — релиз не нужен', () => {
    const r = classifyChangedFiles([
      'app/electron/main/agentHandlersProjectFile.ts',
      'app/tests/agentHandlersProject.test.ts',
      'app/out/main/index.js'
    ])
    assert.equal(r.needed, false)
  })

  it('handler + renderer — релиз нужен', () => {
    const r = classifyChangedFiles([
      'app/electron/main/agentHandlersProjectFile.ts',
      'app/src/App.tsx'
    ])
    assert.equal(r.needed, true)
    assert.ok(r.shellFiles.includes('app/src/App.tsx'))
  })

  it('IPC bootstrap — shell', () => {
    assert.equal(isShellPath('app/electron/main/ipc/registerAppIpc.ts'), true)
  })

  it('bundledSourceSync — shell', () => {
    assert.equal(isShellPath('app/electron/main/bundledSourceSync.ts'), true)
  })
})
