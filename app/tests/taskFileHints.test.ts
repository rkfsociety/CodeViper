import { describe, it, expect } from 'vitest'
import {
  buildTaskFilesUnreadNudge,
  extractTaskFileBasenames,
  wasAnyTaskFileRead
} from '../shared/taskFileHints'

describe('extractTaskFileBasenames', () => {
  it('парсит строку Файлы из ROADMAP-задачи', () => {
    const msg = `Tool find_commit_message_issues
Цель: отчет
Файлы: commitMessageAnalysis.ts, gitTools.ts, agentTools/core.ts, agentHandlersProjectGit.ts
Проверка: npm test`
    expect(extractTaskFileBasenames(msg)).toEqual([
      'commitMessageAnalysis.ts',
      'gitTools.ts',
      'core.ts',
      'agentHandlersProjectGit.ts'
    ])
  })
})

describe('wasAnyTaskFileRead', () => {
  it('true после read_file по basename из задачи', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'app/electron/main/gitTools.ts' })
            }
          }
        ]
      }
    ]
    expect(wasAnyTaskFileRead(messages, ['gitTools.ts'])).toBe(true)
  })

  it('false если читали другой файл', () => {
    const messages = [
      {
        role: 'assistant',
        tool_calls: [
          {
            function: {
              name: 'read_file',
              arguments: JSON.stringify({ path: 'package.json' })
            }
          }
        ]
      }
    ]
    expect(wasAnyTaskFileRead(messages, ['gitTools.ts'])).toBe(false)
  })
})

describe('buildTaskFilesUnreadNudge', () => {
  it('упоминает basenames и app/', () => {
    const nudge = buildTaskFilesUnreadNudge(['gitTools.ts'])
    expect(nudge).toMatch(/gitTools\.ts/)
    expect(nudge).toMatch(/app\//)
  })
})
