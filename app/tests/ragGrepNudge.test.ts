import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/context', isPackaged: false }
}))

vi.mock('../electron/main/services', () => ({
  buildFileTree: async () => []
}))

vi.mock('../electron/main/memory', () => ({
  buildMemoryContext: async () => ''
}))

vi.mock('../electron/main/skills', () => ({
  buildSkillsContext: async () => ''
}))

vi.mock('../electron/main/contextRAG', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../electron/main/contextRAG')>()
  return { ...actual }
})

import {
  GREP_EMPTY_RESULT_PREFIX,
  appendSystemHint,
  buildRagSearchNudgeHint,
  isEmptyGrepToolResult,
  isRagKnowledgeSearchEnabled,
  maybeAppendRagSearchHintAfterEmptyGrep,
  type OllamaMessage
} from '../electron/main/agentContext'

const qdrantMock = vi.hoisted(() => ({
  getCollection: vi.fn()
}))

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    getCollection(...args: unknown[]) {
      return qdrantMock.getCollection(...args)
    }
  }
}))

describe('isEmptyGrepToolResult', () => {
  it('распознаёт пустой grep_files', () => {
    const output = `${GREP_EMPTY_RESULT_PREFIX} (просмотрено файлов: 12).`
    expect(isEmptyGrepToolResult('grep_files', output)).toBe(true)
  })

  it('игнорирует search_in_project с type=name', () => {
    const output = `${GREP_EMPTY_RESULT_PREFIX} (просмотрено файлов: 3).`
    expect(isEmptyGrepToolResult('search_in_project', output, { type: 'name' })).toBe(false)
  })

  it('не срабатывает на ненулевой grep', () => {
    expect(isEmptyGrepToolResult('grep_files', 'Найдено: 2 (файлов просмотрено: 5)')).toBe(false)
  })
})

describe('isRagKnowledgeSearchEnabled', () => {
  it('требует Qdrant URL и включённый search_knowledge_base', () => {
    expect(isRagKnowledgeSearchEnabled({ qdrantUrl: 'http://localhost:6333' })).toBe(true)
    expect(isRagKnowledgeSearchEnabled({ qdrantUrl: '' })).toBe(false)
    expect(
      isRagKnowledgeSearchEnabled({
        qdrantUrl: 'http://localhost:6333',
        disabledTools: ['search_knowledge_base']
      })
    ).toBe(false)
  })
})

describe('buildRagSearchNudgeHint', () => {
  it('рекомендует search_knowledge_base и коллекцию проекта', () => {
    const hint = buildRagSearchNudgeHint('AuthService')
    expect(hint).toContain('search_knowledge_base')
    expect(hint).toContain('codeviper_project')
    expect(hint).toContain('AuthService')
  })
})

describe('appendSystemHint', () => {
  it('дописывает подсказку в system-сообщение один раз', () => {
    const messages: OllamaMessage[] = [
      { role: 'system', content: 'Базовый промпт' },
      { role: 'user', content: 'найди класс' }
    ]
    const hint = buildRagSearchNudgeHint('foo')
    expect(appendSystemHint(messages, hint)).toBe(true)
    expect(messages[0].content).toContain('семантический поиск')
    expect(appendSystemHint(messages, hint)).toBe(false)
  })
})

describe('maybeAppendRagSearchHintAfterEmptyGrep', () => {
  beforeEach(() => {
    qdrantMock.getCollection.mockReset()
  })

  it('добавляет system-hint при пустом grep, RAG и проиндексированном проекте', async () => {
    qdrantMock.getCollection.mockResolvedValue({ points_count: 42 })

    const messages: OllamaMessage[] = [
      { role: 'system', content: 'Система' },
      { role: 'user', content: 'где auth?' }
    ]

    const nudged = await maybeAppendRagSearchHintAfterEmptyGrep(
      messages,
      [
        {
          toolName: 'grep_files',
          output: `${GREP_EMPTY_RESULT_PREFIX} (просмотрено файлов: 8).`,
          args: { query: 'authenticate' }
        }
      ],
      { qdrantUrl: 'http://localhost:6333' },
      false
    )

    expect(nudged).toBe(true)
    expect(messages[0].content).toContain('search_knowledge_base')
    expect(messages[0].content).toContain('authenticate')
  })

  it('не nudge без точек в Qdrant', async () => {
    qdrantMock.getCollection.mockResolvedValue({ points_count: 0 })

    const messages: OllamaMessage[] = [{ role: 'system', content: 'Система' }]
    const nudged = await maybeAppendRagSearchHintAfterEmptyGrep(
      messages,
      [
        {
          toolName: 'grep_files',
          output: `${GREP_EMPTY_RESULT_PREFIX} (просмотрено файлов: 1).`
        }
      ],
      { qdrantUrl: 'http://localhost:6333' },
      false
    )

    expect(nudged).toBe(false)
    expect(messages[0].content).toBe('Система')
  })
})
