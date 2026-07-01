import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'default-skills')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/default-skills' }
}))

import {
  ensureDefaultSkills,
  VIPER_MEMORY_SKILL_ID,
  VIPER_FILES_SKILL_ID,
  VIPER_CODEBASE_SKILL_ID,
  VIPER_AGENT_CORE_SKILL_ID
} from '../electron/main/defaultSkills'
import { getSkill, listSkills, SKILLS_FILENAME, updateSkill } from '../electron/main/skills'
import { BUILTIN_SKILL_IDS } from '../shared/builtinSkills'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('ensureDefaultSkills', () => {
  it('создаёт все встроенные навыки', async () => {
    await ensureDefaultSkills()
    const skills = await listSkills('')
    const builtin = skills.filter((s) =>
      BUILTIN_SKILL_IDS.includes(s.id as (typeof BUILTIN_SKILL_IDS)[number])
    )
    expect(builtin).toHaveLength(BUILTIN_SKILL_IDS.length)
  })

  it('создаёт viper-files с инструкциями по read_file', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_FILES_SKILL_ID, 'global')
    expect(skill?.instructions).toContain('read_file')
    expect(skill?.instructions).toContain('edit_file')
  })

  it('создаёт viper-codebase с grep и find', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_CODEBASE_SKILL_ID, 'global')
    expect(skill?.instructions).toContain('grep_files')
    expect(skill?.instructions).toContain('find_files')
  })

  it('создаёт viper-agent-core со списком инструментов', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_AGENT_CORE_SKILL_ID, 'global')
    expect(skill?.instructions).toContain('list_directory')
    expect(skill?.instructions).toContain('grep_files')
  })

  it('создаёт viper-memory при первом запуске', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_MEMORY_SKILL_ID, 'global')
    expect(skill).not.toBeNull()
    expect(skill?.instructions).toContain('ViperMemory.md')
  })

  it('не дублирует навыки при повторном вызове', async () => {
    await ensureDefaultSkills()
    await ensureDefaultSkills()
    const skills = await listSkills('')
    expect(
      skills.filter((s) => BUILTIN_SKILL_IDS.includes(s.id as (typeof BUILTIN_SKILL_IDS)[number]))
    ).toHaveLength(BUILTIN_SKILL_IDS.length)
  })

  it('обновляет инструкции встроенных навыков при повторном вызове', async () => {
    await ensureDefaultSkills()
    await updateSkill('', VIPER_FILES_SKILL_ID, { instructions: 'устарело' })
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_FILES_SKILL_ID, 'global')
    expect(skill?.instructions).toContain('read_file')
  })

  it('сохраняет ViperSkills.md в userData', async () => {
    await ensureDefaultSkills()
    const path = join(USER_DATA, SKILLS_FILENAME)
    expect(existsSync(path)).toBe(true)
    const raw = readFileSync(path, 'utf-8')
    expect(raw).toContain(VIPER_FILES_SKILL_ID)
  })
})
