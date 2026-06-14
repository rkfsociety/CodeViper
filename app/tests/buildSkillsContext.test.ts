import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'build-skills-context')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/build-skills-context' }
}))

import { buildSkillsContext, createSkill } from '../electron/main/skills'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('buildSkillsContext', () => {
  it('автоматически инжектит инструкции при совпадении триггера', async () => {
    await createSkill('', {
      name: 'Todo',
      description: 'Todo list',
      instructions: 'AUTO_APPLY_MARKER: обнови skill-data',
      triggers: ['todo']
    })

    const ctx = await buildSkillsContext('/any/project', 'сделай todo на сегодня')
    expect(ctx).toContain('Применяемые навыки агента')
    expect(ctx).toContain('AUTO_APPLY_MARKER')
  })

  it('не инжектит инструкции без совпадения триггера', async () => {
    await createSkill('', {
      name: 'Deploy',
      description: 'Deploy only',
      instructions: 'SECRET_DEPLOY_STEPS',
      triggers: ['deploy', 'релиз']
    })

    const ctx = await buildSkillsContext('/any/project', 'прочитай readme')
    expect(ctx).not.toContain('SECRET_DEPLOY_STEPS')
    expect(ctx).not.toContain('Применяемые навыки агента')
  })
})
