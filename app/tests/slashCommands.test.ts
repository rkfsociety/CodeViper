import { describe, expect, it } from 'vitest'
import { expandSlashCommand, matchSlashCommands, SLASH_COMMANDS } from '../shared/slashCommands'

describe('slashCommands', () => {
  it('/lint в списке команд и раскрывается в npm run lint', () => {
    const lint = SLASH_COMMANDS.find((c) => c.trigger === 'lint')
    expect(lint).toBeDefined()
    expect(lint?.description).toMatch(/eslint/i)
    expect(expandSlashCommand('/lint')).toMatch(/npm run lint/i)
    expect(matchSlashCommands('/li').some((c) => c.trigger === 'lint')).toBe(true)
  })

  it('/build в списке команд и раскрывается в npm run build', () => {
    const build = SLASH_COMMANDS.find((c) => c.trigger === 'build')
    expect(build).toBeDefined()
    expect(build?.description).toMatch(/сборк/i)
    expect(expandSlashCommand('/build')).toMatch(/npm run build/i)
    expect(matchSlashCommands('/bu').some((c) => c.trigger === 'build')).toBe(true)
  })

  it('/security в списке команд и раскрывается в security review', () => {
    const security = SLASH_COMMANDS.find((c) => c.trigger === 'security')
    expect(security).toBeDefined()
    expect(security?.description).toMatch(/security|безопас/i)
    const expanded = expandSlashCommand('/security')
    expect(expanded).toMatch(/security review/i)
    expect(expanded).toMatch(/секрет/i)
    expect(expanded).toMatch(/injection/i)
    expect(matchSlashCommands('/sec').some((c) => c.trigger === 'security')).toBe(true)
  })
})
