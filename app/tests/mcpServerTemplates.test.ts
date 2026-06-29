import { describe, expect, it } from 'vitest'
import {
  addMcpStdioTemplate,
  buildMcpStdioTemplate,
  removeMcpStdioTemplate
} from '../shared/mcpServerTemplates'

describe('mcpServerTemplates', () => {
  it('buildMcpStdioTemplate: filesystem подставляет projectPath', () => {
    expect(buildMcpStdioTemplate('filesystem', { projectPath: 'C:\\proj' })).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', 'C:\\proj']
    })
  })

  it('buildMcpStdioTemplate: fetch без доп. аргументов', () => {
    expect(buildMcpStdioTemplate('fetch')).toEqual({
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-fetch']
    })
  })

  it('addMcpStdioTemplate добавляет запись в settings', () => {
    const next = addMcpStdioTemplate(undefined, 'fetch')
    expect(next).toEqual({
      fetch: {
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-fetch']
      }
    })
  })

  it('addMcpStdioTemplate не дублирует шаблон', () => {
    const current = addMcpStdioTemplate(undefined, 'fetch')
    expect(() => addMcpStdioTemplate(current, 'fetch')).toThrow(/уже добавлен/)
  })

  it('removeMcpStdioTemplate удаляет запись', () => {
    const current = addMcpStdioTemplate(undefined, 'fetch')
    expect(removeMcpStdioTemplate(current, 'fetch')).toBeUndefined()
  })
})
