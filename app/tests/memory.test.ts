import { describe, it, expect, vi } from 'vitest'

vi.mock('../electron/main/embeddings', () => ({
  upsertEmbedding: vi.fn(),
  removeEmbedding: vi.fn(),
  semanticSearch: vi.fn().mockResolvedValue(null)
}))

import {
  InMemoryStorage,
  addMemory,
  listMemories,
  searchMemories,
  deleteMemory,
  parseReflectionLearnings,
  parseMemoryMarkdown,
  renderMemoryMarkdown,
  type MemoryStorages
} from '../electron/main/memory'

function makeStorages(): MemoryStorages {
  return { global: new InMemoryStorage(), project: new InMemoryStorage() }
}

describe('ViperMemory.md', () => {
  it('roundtrip parse/render', () => {
    const store = {
      version: 1 as const,
      entries: [
        {
          id: 'abc',
          content: 'Тест',
          category: 'pattern' as const,
          tags: ['a'],
          scope: 'global' as const,
          createdAt: '2026-01-01T00:00:00.000Z',
          lastUsedAt: '2026-01-01T00:00:00.000Z',
          useCount: 1
        }
      ]
    }
    const md = renderMemoryMarkdown(store)
    expect(parseMemoryMarkdown(md).entries).toHaveLength(1)
    expect(parseMemoryMarkdown(md).entries[0].content).toBe('Тест')
  })
})

describe('addMemory / listMemories', () => {
  it('сохраняет и читает глобальное знание', async () => {
    const storages = makeStorages()
    await addMemory(
      '',
      { content: 'Используем 2 пробела', category: 'preference' },
      undefined,
      storages
    )
    const all = await listMemories('', storages)
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('Используем 2 пробела')
    expect(all[0].scope).toBe('global')
    expect(all[0].useCount).toBe(1)
  })

  it('дедуплицирует по содержимому и увеличивает useCount', async () => {
    const storages = makeStorages()
    await addMemory('', { content: 'Повтор', category: 'pattern' }, undefined, storages)
    await addMemory('', { content: 'повтор', category: 'pattern' }, undefined, storages)
    const all = await listMemories('', storages)
    expect(all).toHaveLength(1)
    expect(all[0].useCount).toBe(2)
  })

  it('нормализует теги из строки', async () => {
    const storages = makeStorages()
    await addMemory(
      '',
      { content: 'С тегами', category: 'skill', tags: ' a, b ,, c ' },
      undefined,
      storages
    )
    const all = await listMemories('', storages)
    expect(all[0].tags).toEqual(['a', 'b', 'c'])
  })

  it('бросает ошибку на пустое знание', async () => {
    const storages = makeStorages()
    await expect(
      addMemory('', { content: '  ', category: 'pattern' }, undefined, storages)
    ).rejects.toThrow()
  })

  it('проектное знание попадает в project-хранилище', async () => {
    const storages = makeStorages()
    await addMemory('/proj', { content: 'проект', category: 'project' }, undefined, storages)
    const projectEntries = (await storages.project.read()).entries
    const globalEntries = (await storages.global.read()).entries
    expect(projectEntries).toHaveLength(1)
    expect(globalEntries).toHaveLength(0)
  })
})

describe('searchMemories', () => {
  it('ищет по содержимому и тегам', async () => {
    const storages = makeStorages()
    await addMemory(
      '',
      { content: 'React хуки', category: 'skill', tags: 'frontend' },
      undefined,
      storages
    )
    await addMemory(
      '',
      { content: 'SQL индексы', category: 'skill', tags: 'db' },
      undefined,
      storages
    )

    expect(
      (await searchMemories('', 'react', 10, undefined, storages)).map((m) => m.content)
    ).toEqual(['React хуки'])
    expect((await searchMemories('', 'db', 10, undefined, storages)).map((m) => m.content)).toEqual(
      ['SQL индексы']
    )
    expect(await searchMemories('', 'нет-такого', 10, undefined, storages)).toHaveLength(0)
  })
})

describe('deleteMemory', () => {
  it('удаляет по id', async () => {
    const storages = makeStorages()
    const entry = await addMemory(
      '',
      { content: 'Удалить меня', category: 'mistake' },
      undefined,
      storages
    )
    expect(await deleteMemory('', entry.id, undefined, storages)).toBe(true)
    expect(await listMemories('', storages)).toHaveLength(0)
    expect(await deleteMemory('', 'нет', undefined, storages)).toBe(false)
  })
})

describe('parseReflectionLearnings', () => {
  it('парсит валидный JSON-массив', () => {
    const text = 'Вот уроки: [{"content":"Урок","category":"pattern","tags":["t"]}] конец'
    const result = parseReflectionLearnings(text)
    expect(result).toEqual([{ content: 'Урок', category: 'pattern', tags: ['t'] }])
  })

  it('подменяет неизвестную категорию на pattern', () => {
    const result = parseReflectionLearnings('[{"content":"X","category":"что-то"}]')
    expect(result[0].category).toBe('pattern')
  })

  it('берёт максимум 2 элемента и пропускает пустые', () => {
    const result = parseReflectionLearnings(
      '[{"content":"a"},{"content":"  "},{"content":"b"},{"content":"c"}]'
    )
    expect(result.map((r) => r.content)).toEqual(['a', 'b'])
  })

  it('возвращает [] на мусоре', () => {
    expect(parseReflectionLearnings('нет json')).toEqual([])
    expect(parseReflectionLearnings('[битый')).toEqual([])
    expect(parseReflectionLearnings('')).toEqual([])
  })
})
