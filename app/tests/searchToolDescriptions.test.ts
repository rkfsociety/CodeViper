import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'
import { FILE_TOOLS } from '../electron/main/agentTools/core'
import { ensureDefaultSkills, VIPER_FILES_SKILL_ID } from '../electron/main/defaultSkills'
import { getSkill } from '../electron/main/skills'

const USER_DATA = join(process.cwd(), '.vitest-tmp', 'search-tool-descriptions')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/search-tool-descriptions' }
}))

function toolDescription(name: string): string {
  const tool = FILE_TOOLS.find((entry) => entry.function.name === name)
  if (!tool) throw new Error(`Инструмент ${name} не найден в FILE_TOOLS`)
  return tool.function.description
}

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('search tool descriptions', () => {
  it('grep_files — когда по содержимому многих файлов', () => {
    const description = toolDescription('grep_files').toLowerCase()
    expect(description).toMatch(/когда|содержим|ripgrep|мног/)
    expect(description).toContain('find_files')
    expect(description).toContain('search_in_file')
    expect(description).toContain('file_search_summary')
  })

  it('find_files — когда по имени/glob, не по содержимому', () => {
    const description = toolDescription('find_files').toLowerCase()
    expect(description).toMatch(/когда|glob|имен/)
    expect(description).toContain('grep_files')
  })

  it('search_in_file — один известный path и большие файлы', () => {
    const description = toolDescription('search_in_file').toLowerCase()
    expect(description).toMatch(/когда|512kb|path/)
    expect(description).toContain('grep_files')
    expect(description).toContain('find_files')
  })

  it('file_search_summary — обзор без деталей строк', () => {
    const description = toolDescription('file_search_summary').toLowerCase()
    expect(description).toMatch(/когда|сводк|обзор|без/)
    expect(description).toContain('grep_files')
  })
})

describe('viper-files skill', () => {
  it('содержит секцию «Когда использовать поиск»', async () => {
    await ensureDefaultSkills()
    const skill = await getSkill('', VIPER_FILES_SKILL_ID, 'global')
    const instructions = skill?.instructions ?? ''
    expect(instructions).toContain('Когда использовать поиск')
    expect(instructions).toContain('grep_files')
    expect(instructions).toContain('find_files')
    expect(instructions).toContain('search_in_file')
    expect(instructions).toContain('file_search_summary')
  })
})
