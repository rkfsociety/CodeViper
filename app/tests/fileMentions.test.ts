import { describe, expect, it } from 'vitest'
import {
  filterFileMentionPaths,
  flattenFileTree,
  getActiveFileMention,
  insertFileMention
} from '../shared/fileMentions'
import type { FileNode } from '../src/types'

const tree: FileNode[] = [
  {
    name: 'src',
    path: '/p/src',
    isDirectory: true,
    children: [
      { name: 'App.tsx', path: '/p/src/App.tsx', isDirectory: false },
      { name: 'components', path: '/p/src/components', isDirectory: true, children: [] }
    ]
  },
  { name: 'README.md', path: '/p/README.md', isDirectory: false }
]

describe('fileMentions', () => {
  it('flattenFileTree собирает относительные пути', () => {
    const flat = flattenFileTree(tree)
    expect(flat.map((i) => i.relativePath)).toEqual([
      'src',
      'src/App.tsx',
      'src/components',
      'README.md'
    ])
  })

  it('getActiveFileMention находит @ под курсором', () => {
    const text = 'посмотри @src/App'
    const cursor = text.length
    expect(getActiveFileMention(text, cursor)).toEqual({ start: 9, query: 'src/App' })
  })

  it('filterFileMentionPaths фильтрует по @src', () => {
    const flat = flattenFileTree(tree)
    const matches = filterFileMentionPaths(flat, 'src')
    expect(matches.map((m) => m.relativePath)).toEqual(['src', 'src/App.tsx', 'src/components'])
  })

  it('insertFileMention вставляет путь', () => {
    const text = 'fix @src'
    const { value, cursor } = insertFileMention(text, 4, 8, 'src/App.tsx')
    expect(value).toBe('fix @src/App.tsx')
    expect(cursor).toBe(value.length)
  })
})
