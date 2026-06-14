import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { existsSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'default-skills')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/default-skills' }
}))

import { ensureDefaultSkills, VIPER_MEMORY_SKILL_ID, VIPER_MODEL_TRAINING_SKILL_ID } from '../electron/main/defaultSkills'
import { getSkill, listSkills, SKILLS_FILENAME } from '../electron/main/skills'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('ensureDefaultSkills', () => {
  it('создаёт навык viper-memory при первом запуске', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_MEMORY_SKILL_ID, 'global')
    expect(skill).not.toBeNull()
    expect(skill?.name).toBe('Viper Memory')
    expect(skill?.instructions).toContain('ViperMemory.md')
  })

  it('создаёт навык viper-model-training при первом запуске', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_MODEL_TRAINING_SKILL_ID, 'global')
    expect(skill).not.toBeNull()
    expect(skill?.instructions).toContain('create_ollama_model')
  })

  it('не дублирует навыки при повторном вызове', async () => {
    await ensureDefaultSkills()
    await ensureDefaultSkills()
    const skills = await listSkills('')
    const memorySkills = skills.filter(
      (s) => s.id === VIPER_MEMORY_SKILL_ID || s.id === VIPER_MODEL_TRAINING_SKILL_ID
    )
    expect(memorySkills).toHaveLength(2)
  })

  it('сохраняет skills.json в userData', async () => {
    await ensureDefaultSkills()
    const path = join(USER_DATA, 'ViperSkills.md')
    expect(existsSync(path)).toBe(true)
    const raw = readFileSync(path, 'utf-8')
    expect(raw).toContain(VIPER_MEMORY_SKILL_ID)
  })
})
