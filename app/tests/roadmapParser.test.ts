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
  formatRoadmapItemDetail,
  resolveRoadmapFileHints
} from '../electron/main/roadmapParser'
import { getCodeViperSourceRoot } from '../electron/main/codeviperSource'

describe('roadmapParser', () => {
  it('находит ROADMAP.md в репозитории', () => {
    expect(resolveRoadmapPath()).toBeTruthy()
  })

  it('парсит пункты «В планах»', async () => {
    const items = await listRoadmapItems()
    expect(items.length).toBe(432)
    expect(items[0]?.num).toBe(1)
    expect(items[0]?.title).toMatch(/переиндексац/i)
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
    const text = formatRoadmapItemDetail(item!, getCodeViperSourceRoot())
    expect(text).toContain('Цель:')
    expect(text).toContain('Файлы:')
    expect(text).toContain('Действие:')
    expect(text).toContain('Проверка:')
    expect(text).toContain('ProjectTreePanel')
    expect(text).toContain('index_project')
  })

  it('resolveRoadmapFileHints разрешает короткие имена из ROADMAP', () => {
    const root = getCodeViperSourceRoot()
    const hints = resolveRoadmapFileHints(
      '`openaiProvider.ts`, `modelRuntime.ts`, `ModelTab/providers/`',
      root
    )
    expect(hints).toContain('electron/main/providers/openaiProvider.ts')
    expect(hints).toContain('electron/main/modelRuntime.ts')
    expect(hints).toContain('src/components/SettingsModal/ModelTab.tsx')
    expect(hints).toContain('ModelTab/providers/')
  })

  it('resolveRoadmapFileHints — ProjectTreePanel.tsx и index_project (trace 1782686538797)', () => {
    const root = getCodeViperSourceRoot()
    const hints = resolveRoadmapFileHints('`ProjectTreePanel.tsx`, IPC вызов `index_project`', root)
    expect(hints).toContain('src/components/ProjectTreePanel.tsx')
    expect(hints).toContain('autoIndexProject')
    expect(hints).toContain('agentHandlersProject.ts')
  })

  it('readRoadmapItem возвращает null для несуществующего номера', async () => {
    expect(await readRoadmapItem(999_999)).toBeNull()
  })
})
