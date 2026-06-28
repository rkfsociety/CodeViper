import { describe, it, expect } from 'vitest'
import { MAX_RECENT_PROJECTS, touchRecentProject } from '../shared/recentProjects'

describe('recentProjects', () => {
  it('добавляет путь в начало без дублей', () => {
    const list = touchRecentProject(['C:/a', 'C:/b'], 'C:/c')
    expect(list).toEqual(['C:/c', 'C:/a', 'C:/b'])
  })

  it('перемещает существующий путь наверх', () => {
    const list = touchRecentProject(['C:/a', 'C:/b', 'C:/c'], 'C:/b')
    expect(list[0]).toBe('C:/b')
    expect(list).toHaveLength(3)
  })

  it('ограничивает список MAX_RECENT_PROJECTS', () => {
    const initial = Array.from({ length: 10 }, (_, i) => `C:/p${i}`)
    const list = touchRecentProject(initial, 'C:/new')
    expect(list).toHaveLength(MAX_RECENT_PROJECTS)
    expect(list[0]).toBe('C:/new')
  })
})
