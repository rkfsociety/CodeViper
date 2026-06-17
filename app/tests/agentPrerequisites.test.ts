import { describe, it, expect } from 'vitest'
import { detectPackageManager, formatPrerequisitesMessage } from '../shared/agentPrerequisites'

describe('agentPrerequisites', () => {
  it('detectPackageManager выбирает pnpm/yarn/npm', () => {
    expect(detectPackageManager({ pnpmLock: true, yarnLock: false }).installCommand).toBe(
      'pnpm install'
    )
    expect(detectPackageManager({ pnpmLock: false, yarnLock: true }).installCommand).toBe(
      'yarn install'
    )
    expect(detectPackageManager({ pnpmLock: false, yarnLock: false }).installCommand).toBe(
      'npm install'
    )
  })

  it('formatPrerequisitesMessage описывает проблемы', () => {
    const text = formatPrerequisitesMessage([
      { type: 'no_model', suggestedModels: ['qwen2.5-coder:7b'] },
      { type: 'node_install', packageManager: 'npm', installCommand: 'npm install' }
    ])
    expect(text).toContain('tool calling')
    expect(text).toContain('npm install')
  })
})
