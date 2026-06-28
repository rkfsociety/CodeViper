import { describe, it, expect } from 'vitest'
import { filterQuickOpenFiles, fuzzyMatchPath } from '../shared/quickOpen'
import type { FileMentionItem } from '../shared/fileMentions'

function file(path: string): FileMentionItem {
  return { relativePath: path, isDirectory: false }
}

describe('quickOpen fuzzy search', () => {
  const items: FileMentionItem[] = [
    file('src/App.tsx'),
    file('src/components/ChatPanel/index.tsx'),
    file('electron/main/settings.ts'),
    file('README.md')
  ]

  it('fuzzyMatchPath: символы запроса по порядку в пути', () => {
    expect(fuzzyMatchPath('src/App.tsx', 'apptsx')).not.toBeNull()
    expect(fuzzyMatchPath('src/App.tsx', 'zzz')).toBeNull()
  })

  it('filterQuickOpenFiles без запроса — первые файлы', () => {
    const result = filterQuickOpenFiles(items, '')
    expect(result.length).toBe(4)
  })

  it('filterQuickOpenFiles находит по фрагменту пути', () => {
    const result = filterQuickOpenFiles(items, 'chatpanel')
    expect(result[0]?.relativePath).toContain('ChatPanel')
  })

  it('filterQuickOpenFiles не включает директории', () => {
    const withDir: FileMentionItem[] = [
      ...items,
      { relativePath: 'src', isDirectory: true },
      { relativePath: 'src/components', isDirectory: true }
    ]
    const result = filterQuickOpenFiles(withDir, 'src')
    expect(result.every((item) => !item.isDirectory)).toBe(true)
  })
})
