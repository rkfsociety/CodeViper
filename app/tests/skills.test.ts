import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'skills')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/skills' }
}))

import {
  createSkill,
  deleteSkill,
  importSkillsFromDirectory,
  listSkills,
  parseSkillsMarkdown,
  renderSkillsMarkdown,
  SKILLS_FILENAME,
  updateSkill
} from '../electron/main/skills'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('ViperSkills.md', () => {
  it('сохраняет навык в ViperSkills.md с scope global по умолчанию', async () => {
    await createSkill('/any/project', {
      name: 'Todo Helper',
      description: 'Управление задачами',
      instructions: 'Шаги для todo'
    })

    const path = join(USER_DATA, SKILLS_FILENAME)
    expect(existsSync(path)).toBe(true)

    const raw = readFileSync(path, 'utf-8')
    expect(raw).toContain('# ViperSkills')
    expect(raw).toContain('Todo Helper')

    const skills = await listSkills('/other/project')
    expect(skills).toHaveLength(1)
    expect(skills[0].scope).toBe('global')
    expect(skills[0].name).toBe('Todo Helper')
  })

  it('roundtrip parse/render', () => {
    const store = {
      version: 1 as const,
      skills: [
        {
          id: 'test-skill',
          name: 'Test',
          description: 'Desc',
          instructions: 'Do things',
          triggers: ['todo'],
          scope: 'global' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
          useCount: 0
        }
      ]
    }

    const md = renderSkillsMarkdown(store)
    expect(parseSkillsMarkdown(md).skills[0].name).toBe('Test')
  })

  it('мигрирует legacy skills.json', async () => {
    rmSync(USER_DATA, { recursive: true, force: true })
    const { mkdirSync, writeFileSync } = await import('fs')
    mkdirSync(USER_DATA, { recursive: true })
    writeFileSync(
      join(USER_DATA, 'skills.json'),
      JSON.stringify({
        version: 1,
        skills: [
          {
            id: 'old-skill',
            name: 'Legacy',
            description: 'From json',
            instructions: 'Old',
            triggers: [],
            scope: 'global',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
            useCount: 1
          }
        ]
      })
    )

    const skills = await listSkills('')
    expect(skills).toHaveLength(1)
    expect(skills[0].id).toBe('old-skill')
    expect(existsSync(join(USER_DATA, SKILLS_FILENAME))).toBe(true)
  })

  it('игнорирует scope project — навык всегда global', async () => {
    await createSkill('/proj', {
      name: 'Project Attempt',
      description: 'd',
      instructions: 'i',
      scope: 'project'
    })

    const skills = await listSkills('/proj')
    expect(skills).toHaveLength(1)
    expect(skills[0].scope).toBe('global')
  })

  it('нельзя удалить встроенный системный навык', async () => {
    await expect(deleteSkill('', 'viper-agent-core')).rejects.toThrow(/встроенный/)
  })

  it('обновление навыка сохраняется на диск', async () => {
    const created = await createSkill('', {
      name: 'Mutable',
      description: 'v1',
      instructions: 'v1'
    })

    await updateSkill('', created.id, { description: 'v2' })
    const skills = await listSkills('')
    expect(skills[0].description).toBe('v2')

    const raw = readFileSync(join(USER_DATA, SKILLS_FILENAME), 'utf-8')
    expect(raw).toContain('v2')
  })

  it('importSkillsFromDirectory imports skills from a plugin repo', async () => {
    const { mkdirSync, writeFileSync } = await import('fs')
    const repoRoot = join(USER_DATA, 'superpowers-repo')
    mkdirSync(join(repoRoot, 'skills', 'test-skill'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'skills', 'test-skill', 'SKILL.md'),
      `---
name: Test Skill
description: Imported from repo
triggers: todo, plan
---
Do the thing.
`
    )

    const result = await importSkillsFromDirectory('', repoRoot)
    expect(result.imported).toBe(1)
    expect(result.skipped).toBe(0)
    expect(result.skillIds).toHaveLength(1)

    const skills = await listSkills('')
    expect(skills[0]?.name).toBe('Test Skill')
    expect(skills[0]?.triggers).toEqual(['todo', 'plan'])
  })
})
