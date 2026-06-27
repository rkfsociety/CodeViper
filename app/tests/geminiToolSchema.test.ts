import { describe, it, expect } from 'vitest'
import { join } from 'path'
import { GEMINI_MINIMAL_TOOL_SCHEMA, simplifySchemaForGemini } from '../shared/geminiToolSchema'

describe('simplifySchemaForGemini', () => {
  it('всегда возвращает минимальную object-схему без properties', () => {
    expect(
      simplifySchemaForGemini({
        type: 'object',
        properties: {
          query: { type: 'string', description: 'поиск' },
          path: { type: 'string', description: 'папка' },
          limit: { type: 'string', description: 'лимит' }
        },
        required: ['query']
      })
    ).toEqual(GEMINI_MINIMAL_TOOL_SCHEMA)
  })

  it('сворачивает вложенные object/array так же в пустую схему', () => {
    expect(
      simplifySchemaForGemini({
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
    ).toEqual(GEMINI_MINIMAL_TOOL_SCHEMA)
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
    ).toEqual(GEMINI_MINIMAL_TOOL_SCHEMA)
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
