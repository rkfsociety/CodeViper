import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? process.cwd() : process.cwd())
  }
}))

import {
  listRoadmapItems,
  resolveRoadmapPath,
  formatRoadmapItemsList
} from '../electron/main/roadmapParser'

describe('roadmapParser', () => {
  it('находит ROADMAP.md в репозитории', () => {
    expect(resolveRoadmapPath()).toBeTruthy()
  })

  it('парсит пункты «В планах»', async () => {
    const items = await listRoadmapItems()
    expect(items.length).toBe(138)
    expect(items[0]?.num).toBe(1)
    expect(items[0]?.title).toContain('read_roadmap_item')
  })

  it('formatRoadmapItemsList выводит num · title · chain', async () => {
    const items = await listRoadmapItems()
    const text = formatRoadmapItemsList(items)
    expect(text).toContain(`${items[0]!.num} · ${items[0]!.title} · ${items[0]!.chain}`)
  })
})
