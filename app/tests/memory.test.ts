import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'
import { rmSync } from 'fs'
import { join } from 'path'

// Каталог-«userData» для теста (electron.app.getPath замокан ниже).
const USER_DATA = join(process.cwd(), '.vitest-tmp', 'mem')

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/mem' }
}))

import {
  addMemory,
  listMemories,
  searchMemories,
  deleteMemory,
  parseReflectionLearnings
} from '../electron/main/memory'

beforeEach(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

afterAll(() => {
  rmSync(USER_DATA, { recursive: true, force: true })
})

describe('addMemory / listMemories', () => {
  it('сохраняет и читает глобальное знание', async () => {
    await addMemory('', { content: 'Используем 2 пробела', category: 'preference' })
    const all = await listMemories('')
    expect(all).toHaveLength(1)
    expect(all[0].content).toBe('Используем 2 пробела')
    expect(all[0].scope).toBe('global')
    expect(all[0].useCount).toBe(1)
  })

  it('дедуплицирует по содержимому и увеличивает useCount', async () => {
    await addMemory('', { content: 'Повтор', category: 'pattern' })
    await addMemory('', { content: 'повтор', category: 'pattern' })
    const all = await listMemories('')
    expect(all).toHaveLength(1)
    expect(all[0].useCount).toBe(2)
  })

  it('нормализует теги из строки', async () => {
    await addMemory('', { content: 'С тегами', category: 'skill', tags: ' a, b ,, c ' })
    const all = await listMemories('')
    expect(all[0].tags).toEqual(['a', 'b', 'c'])
  })

  it('бросает ошибку на пустое знание', async () => {
    await expect(addMemory('', { content: '  ', category: 'pattern' })).rejects.toThrow()
  })
})

describe('searchMemories', () => {
  it('ищет по содержимому и тегам', async () => {
    await addMemory('', { content: 'React хуки', category: 'skill', tags: 'frontend' })
    await addMemory('', { content: 'SQL индексы', category: 'skill', tags: 'db' })

    expect((await searchMemories('', 'react')).map((m) => m.content)).toEqual(['React хуки'])
    expect((await searchMemories('', 'db')).map((m) => m.content)).toEqual(['SQL индексы'])
    expect(await searchMemories('', 'нет-такого')).toHaveLength(0)
  })
})

describe('deleteMemory', () => {
  it('удаляет по id', async () => {
    const entry = await addMemory('', { content: 'Удалить меня', category: 'mistake' })
    expect(await deleteMemory('', entry.id)).toBe(true)
    expect(await listMemories('')).toHaveLength(0)
    expect(await deleteMemory('', 'нет')).toBe(false)
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
