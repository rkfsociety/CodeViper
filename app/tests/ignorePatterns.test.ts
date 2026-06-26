import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { buildFileTree } from '../electron/main/services'
import { clearIgnorePatternsCache } from '../electron/main/ignorePatterns'

function collectNames(nodes: { name: string; children?: { name: string }[] }[]): string[] {
  const names: string[] = []
  for (const node of nodes) {
    names.push(node.name)
    if (node.children?.length) names.push(...collectNames(node.children))
  }
  return names
}

describe('ignorePatterns / list_directory', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-ignore-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'index.ts'), 'export {}\n')
    writeFileSync(join(root, 'src', 'secret.ts'), 'export const secret = 1\n')
    writeFileSync(join(root, 'README.md'), '# demo\n')
    clearIgnorePatternsCache()
  })

  afterEach(() => {
    clearIgnorePatternsCache()
    rmSync(root, { recursive: true, force: true })
  })

  it('файл из .codeviperignore не попадает в list_directory (buildFileTree)', async () => {
    writeFileSync(join(root, '.codeviperignore'), 'secret.ts\n')

    const tree = await buildFileTree(root, 0, 3)
    const names = collectNames(tree)

    expect(names).toContain('README.md')
    expect(names).toContain('src')
    expect(names).toContain('index.ts')
    expect(names).not.toContain('secret.ts')
  })

  it('паттерн .codeviperignore дополняет .cursorignore', async () => {
    writeFileSync(join(root, '.cursorignore'), 'README.md\n')
    writeFileSync(join(root, '.codeviperignore'), 'secret.ts\n')

    const tree = await buildFileTree(root, 0, 3)
    const names = collectNames(tree)

    expect(names).not.toContain('README.md')
    expect(names).not.toContain('secret.ts')
    expect(names).toContain('index.ts')
  })
})
