import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => (name === 'userData' ? process.cwd() : process.cwd())
  }
}))

import {
  listRoadmapItems,
  resolveRoadmapPath,
  formatRoadmapItemsList,
  readRoadmapItem,
  formatRoadmapItemDetail
} from '../electron/main/roadmapParser'

describe('roadmapParser', () => {
  it('находит ROADMAP.md в репозитории', () => {
    expect(resolveRoadmapPath()).toBeTruthy()
  })

  it('парсит пункты «В планах»', async () => {
    const items = await listRoadmapItems()
    expect(items.length).toBe(134)
    expect(items[0]?.num).toBe(1)
    expect(items[0]?.title).toMatch(/горяч|клавиш/i)
  })

  it('formatRoadmapItemsList выводит num · title · chain', async () => {
    const items = await listRoadmapItems()
    const text = formatRoadmapItemsList(items)
    expect(text).toContain(`${items[0]!.num} · ${items[0]!.title} · ${items[0]!.chain}`)
  })

  it('readRoadmapItem парсит поля шаблона существующего пункта', async () => {
    const item = await readRoadmapItem(1)
    expect(item).not.toBeNull()
    expect(item!.goal.length).toBeGreaterThan(0)
    expect(item!.files.length).toBeGreaterThan(0)
    expect(item!.action.length).toBeGreaterThan(0)
    expect(item!.verification.length).toBeGreaterThan(0)
  })

  it('formatRoadmapItemDetail содержит все поля шаблона', async () => {
    const item = await readRoadmapItem(1)
    expect(item).not.toBeNull()
    const text = formatRoadmapItemDetail(item!)
    expect(text).toContain('Цель:')
    expect(text).toContain('Файлы:')
    expect(text).toContain('Действие:')
    expect(text).toContain('Проверка:')
  })

  it('readRoadmapItem возвращает null для несуществующего номера', async () => {
    expect(await readRoadmapItem(999_999)).toBeNull()
  })
})
