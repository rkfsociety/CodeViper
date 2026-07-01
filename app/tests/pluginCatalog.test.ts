import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mkdirSync, writeFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { PLUGIN_CATALOG, catalogSkillId } from '../shared/pluginCatalog'

const USER_DATA = join(process.cwd(), 'test-userdata-plugin-catalog')

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? USER_DATA : '/tmp')
  }
}))

vi.mock('child_process', () => {
  const spawn = vi.fn(() => {
    const handlers: Record<string, (...args: unknown[]) => void> = {}
    const child = {
      stdout: {
        on: vi.fn((_event: string, cb: (...args: unknown[]) => void) => {
          handlers.stdout = cb
        })
      },
      stderr: { on: vi.fn() },
      on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
        handlers[event] = cb
        if (event === 'close') {
          setTimeout(() => cb(0), 0)
        }
      }),
      kill: vi.fn()
    }
    setTimeout(() => {
      handlers.stdout?.(Buffer.from(''))
    }, 0)
    return child
  })
  return { spawn }
})

describe('pluginCatalog', () => {
  beforeEach(() => {
    if (existsSync(USER_DATA)) rmSync(USER_DATA, { recursive: true, force: true })
    mkdirSync(USER_DATA, { recursive: true })
  })

  it('PLUGIN_CATALOG contains superpowers', () => {
    const entry = PLUGIN_CATALOG.find((item) => item.id === 'superpowers')
    expect(entry?.repoUrl).toContain('obra/superpowers')
  })

  it('catalogSkillId builds stable ids', () => {
    expect(catalogSkillId('superpowers', 'brainstorming')).toBe('plugin-superpowers-brainstorming')
  })

  it('installPluginCatalogEntry imports skills from local repo layout', async () => {
    const repoRoot = join(USER_DATA, 'plugin-catalog', 'superpowers')
    mkdirSync(join(repoRoot, 'skills', 'demo-skill'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'skills', 'demo-skill', 'SKILL.md'),
      `---
name: Demo Skill
description: From catalog test
triggers: demo
---
Do demo.
`
    )
    writeFileSync(join(repoRoot, '.git'), '')

    const { installPluginCatalogEntry } = await import('../electron/main/pluginCatalogService')
    const { listSkills } = await import('../electron/main/skills')

    const result = await installPluginCatalogEntry('superpowers', '')
    expect(result.ok).toBe(true)
    expect(result.imported).toBe(1)

    const skills = await listSkills('')
    expect(skills.some((skill) => skill.id === 'plugin-superpowers-demo-skill')).toBe(true)
  })
})
