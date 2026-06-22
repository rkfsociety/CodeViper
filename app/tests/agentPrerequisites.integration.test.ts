import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { vi } from 'vitest'

const TMP = join(process.cwd(), '.vitest-tmp', 'agent-prerequisites')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/agent-prerequisites' }
}))

vi.mock('../electron/main/agent', () => ({
  pingOllama: vi.fn(async () => true),
  fetchOllamaModels: vi.fn(async () => [{ name: 'qwen2.5-coder:7b', size: 1, modifiedAt: '' }])
}))

import {
  checkProjectNodeDependencies,
  checkAgentPrerequisites
} from '../electron/main/agentPrerequisites'

beforeEach(() => {
  rmSync(TMP, { recursive: true, force: true })
  mkdirSync(TMP, { recursive: true })
})

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true })
})

describe('checkProjectNodeDependencies', () => {
  it('требует npm install если есть package.json без node_modules', async () => {
    writeFileSync(
      join(TMP, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { lodash: '^4.0.0' } })
    )
    const issue = await checkProjectNodeDependencies(TMP)
    expect(issue?.type).toBe('node_install')
    expect(issue && issue.type === 'node_install' && issue.installCommand).toBe('npm install')
  })

  it('не требует install если package.json без зависимостей', async () => {
    writeFileSync(join(TMP, 'package.json'), JSON.stringify({ name: 'demo', type: 'module' }))
    const issue = await checkProjectNodeDependencies(TMP)
    expect(issue).toBeNull()
  })

  it('не требует install если node_modules есть', async () => {
    writeFileSync(
      join(TMP, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { lodash: '^4.0.0' } })
    )
    mkdirSync(join(TMP, 'node_modules'))
    writeFileSync(join(TMP, 'node_modules', '.keep'), '')
    const issue = await checkProjectNodeDependencies(TMP)
    expect(issue).toBeNull()
  })
})

describe('checkAgentPrerequisites', () => {
  it('ok когда ollama и node_modules на месте', async () => {
    writeFileSync(
      join(TMP, 'package.json'),
      JSON.stringify({ name: 'demo', dependencies: { lodash: '^4.0.0' } })
    )
    mkdirSync(join(TMP, 'node_modules'))
    writeFileSync(join(TMP, 'node_modules', '.keep'), '')

    const result = await checkAgentPrerequisites('http://127.0.0.1:11434', TMP)
    expect(result.ok).toBe(true)
    expect(existsSync(join(TMP, 'package.json'))).toBe(true)
  })
})
