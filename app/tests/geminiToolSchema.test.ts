import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { simplifySchemaForGemini } from '../shared/geminiToolSchema'

describe('simplifySchemaForGemini', () => {
  it('оставляет только required-поля', () => {
    const result = simplifySchemaForGemini({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'поиск' },
        path: { type: 'string', description: 'папка' },
        limit: { type: 'string', description: 'лимит' }
      },
      required: ['query']
    })

    expect(result).toEqual({
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query']
    })
  })

  it('сворачивает вложенные object/array в string', () => {
    const result = simplifySchemaForGemini({
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, title: { type: 'string' } },
            required: ['id', 'title']
          }
        }
      },
      required: ['items']
    })

    expect(result).toEqual({
      type: 'object',
      properties: { items: { type: 'string', description: 'JSON-массив' } },
      required: ['items']
    })
  })

  it('возвращает пустой object без required', () => {
    expect(
      simplifySchemaForGemini({
        type: 'object',
        properties: {
          path: { type: 'string' },
          max_depth: { type: 'string' }
        }
      })
    ).toEqual({ type: 'object', properties: {} })
  })
})

describe('normalizeCodeViperPath', () => {
  it('убирает лишний app/ когда корень уже app', async () => {
    const { normalizeCodeViperPath } = await import('../electron/main/codeviperSource')
    const appRoot = join('C:', 'Users', 'roman', 'AppData', 'Roaming', 'codeviper', 'source', 'app')

    expect(normalizeCodeViperPath(appRoot, 'app/electron/main/agent.ts')).toBe(
      'electron/main/agent.ts'
    )
    expect(normalizeCodeViperPath(appRoot, 'electron/main/agentTools/integrations.ts')).toBe(
      'electron/main/agentTools/integrations.ts'
    )
    expect(normalizeCodeViperPath(appRoot, '../ROADMAP.md')).toBe('../ROADMAP.md')
  })

  it('не меняет путь если корень не app', async () => {
    const { normalizeCodeViperPath } = await import('../electron/main/codeviperSource')
    const repoRoot = join('F:', 'github', 'CodeViper')

    expect(normalizeCodeViperPath(repoRoot, 'app/electron/main/agent.ts')).toBe(
      'app/electron/main/agent.ts'
    )
  })
})
