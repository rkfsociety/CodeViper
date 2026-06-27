import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? process.cwd() : process.cwd())
  }
}))

import { listRoadmapItems, resolveRoadmapPath } from '../electron/main/roadmapParser'

describe('roadmapParser', () => {
  it('находит ROADMAP.md в репозитории', () => {
    expect(resolveRoadmapPath()).toBeTruthy()
  })

  it('парсит пункты «В планах»', async () => {
    const items = await listRoadmapItems()
    expect(items.length).toBe(140)
    expect(items[0]?.num).toBe(1)
    expect(items[0]?.title).toContain('list_pull_requests')
  })
})
