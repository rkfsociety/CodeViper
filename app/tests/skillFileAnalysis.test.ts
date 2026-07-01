import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('../electron/main/skills', () => ({
  listSkills: vi.fn()
}))

import { listSkills } from '../electron/main/skills'
import { findSkillFileIssues } from '../electron/main/skillFileAnalysis'

const mockListSkills = vi.mocked(listSkills)
let root = ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cv-skill-analysis-'))
  mockListSkills.mockResolvedValue([])
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

function writeSkill(relDir: string, content: string): string {
  const file = join(root, 'skills', relDir, 'SKILL.md')
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content, 'utf8')
  return file
}

describe('findSkillFileIssues', () => {
  it('возвращает пустой отчет, если SKILL.md валидны', async () => {
    writeSkill(
      'todo',
      `---
name: Todo
description: Task helper
triggers: todo, tasks
---
Do things.
`
    )

    const report = await findSkillFileIssues(root)
    expect(report).toBe('Битых SKILL.md не найдено.')
  })

  it('находит битые frontmatter, пустой trigger и дубли', async () => {
    writeSkill('broken', `# no frontmatter\njust text`)
    writeSkill(
      'empty',
      `---
name: Empty
description: Broken
triggers:
---
No triggers.
`
    )
    writeSkill(
      'dup-a',
      `---
name: Dup A
description: First
triggers: shared
---
First.
`
    )
    writeSkill(
      'dup-b',
      `---
name: Dup B
description: Second
triggers: shared
---
Second.
`
    )

    mockListSkills.mockResolvedValue([
      {
        id: 'runtime-skill',
        name: 'Runtime',
        description: 'Loaded elsewhere',
        instructions: '',
        triggers: ['shared'],
        scope: 'global',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        useCount: 0
      } as any
    ])

    const report = await findSkillFileIssues(root)
    expect(report).toContain('Найдено 3 проблем')
    expect(report).toContain('нет frontmatter')
    expect(report).toContain('пустой trigger')
    expect(report).toContain('дубликат trigger "shared"')
    expect(report).toContain('list_skills:runtime-skill')
  })
})
