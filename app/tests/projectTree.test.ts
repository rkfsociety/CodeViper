import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildFileTree } from '../electron/main/services'
import { parseTreeDepth } from '../electron/main/agentHandlersUtils'
import type { FileNode } from '../src/types'

function formatTreeLines(nodes: FileNode[], prefix = ''): string[] {
  const lines: string[] = []
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    const last = i === nodes.length - 1
    const branch = last ? '└── ' : '├── '
    lines.push(`${prefix}${branch}${node.name}${node.isDirectory ? '/' : ''}`)
    if (node.children?.length) {
      lines.push(...formatTreeLines(node.children, `${prefix}${last ? '    ' : '│   '}`))
    }
  }
  return lines
}

describe('project tree', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-tree-'))
    mkdirSync(join(root, 'src', 'components'), { recursive: true })
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}\n')
    writeFileSync(join(root, 'src', 'components', 'App.tsx'), 'export {}\n')
    writeFileSync(join(root, 'README.md'), '# demo\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('дерево buildFileTree совпадает с форматом list_directory', async () => {
    const depth = parseTreeDepth(undefined)
    const tree = await buildFileTree(root, 0, depth)
    const formatted = formatTreeLines(tree).join('\n')

    expect(formatted).toContain('src/')
    expect(formatted).toContain('components/')
    expect(formatted).toContain('App.tsx')
    expect(formatted).toContain('index.ts')
    expect(formatted).toContain('README.md')
    expect(tree.map((n) => n.name).sort()).toEqual(['README.md', 'src'])
  })

  it('ПКМ «Спросить агента» вставляет @path в поле ввода', () => {
    const appendMention = (prev: string, relativePath: string) => {
      const mention = `@${relativePath.replace(/\\/g, '/')}`
      if (!prev.trim()) return mention
      const needsSpace = !prev.endsWith(' ') && !prev.endsWith('\n')
      return `${prev}${needsSpace ? ' ' : ''}${mention}`
    }

    expect(appendMention('', 'src/components/App.tsx')).toBe('@src/components/App.tsx')
    expect(appendMention('посмотри', 'src/components/App.tsx')).toBe(
      'посмотри @src/components/App.tsx'
    )
  })
})
