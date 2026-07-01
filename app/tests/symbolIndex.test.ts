import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  findSymbolDeclarations,
  findSymbolReferences,
  findImportCycles,
  formatSymbolResults,
  formatImportCycles,
  buildDependencyDiagram,
  formatDependencyDiagram,
  graphToMermaid,
  buildClassDiagram,
  formatClassDiagram,
  classesToMermaid,
  buildDataflowDiagram,
  formatDataflowDiagram,
  dataflowToMermaid,
  type ClassDiagramClass
} from '../electron/main/symbolIndex'

describe('symbolIndex', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-symbol-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'sample.ts'),
      [
        'export function knownHelper(value: string): string {',
        '  return knownHelperEcho(value)',
        '}',
        '',
        'function knownHelperEcho(input: string): string {',
        '  return input',
        '}',
        '',
        'export class KnownClass {',
        '  run() {',
        '    return knownHelper("x")',
        '  }',
        '}'
      ].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'util.py'),
      ['def known_helper(data):', '    return data', '', 'class KnownPyClass:', '    pass'].join(
        '\n'
      )
    )
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('find_symbol находит объявление известной функции в ts', async () => {
    const result = await findSymbolDeclarations(root, 'knownHelper')
    expect(result.symbols.length).toBeGreaterThan(0)
    const hit = result.symbols.find((s) => s.path.endsWith('sample.ts'))
    expect(hit).toBeDefined()
    expect(hit!.line).toBe(1)
    expect(hit!.kind).toBe('function')
    expect(formatSymbolResults(root, 'knownHelper', result, 'declaration')).toContain(
      'sample.ts:1:'
    )
  })

  it('find_symbol находит класс и python-функцию', async () => {
    const tsClass = await findSymbolDeclarations(root, 'KnownClass')
    expect(tsClass.symbols.some((s) => s.kind === 'class')).toBe(true)

    const pyFn = await findSymbolDeclarations(root, 'known_helper')
    expect(pyFn.symbols.some((s) => s.path.endsWith('util.py') && s.kind === 'function')).toBe(true)
  })

  it('find_references находит вхождения символа', async () => {
    const result = await findSymbolReferences(root, 'knownHelper')
    expect(result.symbols.length).toBeGreaterThan(1)
    expect(result.symbols.some((s) => s.line > 1)).toBe(true)
  })

  it('findImportCycles находит цикл a.ts → b.ts → a.ts', async () => {
    writeFileSync(
      join(root, 'src', 'a.ts'),
      ["import { b } from './b'", '', 'export const a = () => b()'].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'b.ts'),
      ["import { a } from './a'", '', 'export const b = () => a()'].join('\n')
    )

    const result = await findImportCycles(root)
    expect(result.cycles.length).toBeGreaterThan(0)
    const formatted = formatImportCycles(root, result)
    expect(formatted).toContain('a.ts')
    expect(formatted).toContain('b.ts')
    expect(formatted).toContain('→')
  })

  it('findImportCycles не находит цикл в ациклическом графе', async () => {
    writeFileSync(
      join(root, 'src', 'leaf.ts'),
      ["import { knownHelper } from './sample'", '', 'export const leaf = knownHelper'].join('\n')
    )

    const result = await findImportCycles(root)
    const cyclic = result.cycles.some((cycle) =>
      cycle.chain.some((file) => file.endsWith('leaf.ts') || file.endsWith('sample.ts'))
    )
    expect(cyclic).toBe(false)
  })

  it('buildDependencyDiagram строит Mermaid-граф import/require', async () => {
    writeFileSync(
      join(root, 'src', 'main.ts'),
      ["import { helper } from './util'", '', 'export const main = helper()'].join('\n')
    )
    writeFileSync(join(root, 'src', 'util.ts'), ['export const helper = () => 1'].join('\n'))

    const result = await buildDependencyDiagram(root)
    expect(result.nodeCount).toBeGreaterThanOrEqual(2)
    expect(result.edgeCount).toBeGreaterThanOrEqual(1)
    expect(result.nodes.length).toBeGreaterThanOrEqual(2)
    expect(result.edges.length).toBeGreaterThanOrEqual(1)
    expect(result.mermaid).toContain('graph LR')
    expect(result.mermaid).toContain('main.ts')
    expect(result.mermaid).toContain('util.ts')

    const formatted = formatDependencyDiagram(result)
    expect(formatted).toContain('```mermaid')
    expect(formatted).toContain('graph LR')
  })

  it('graphToMermaid обрезает граф по лимиту рёбер', () => {
    const graph = new Map<string, string[]>()
    graph.set(join(root, 'a.ts'), [join(root, 'b.ts')])
    graph.set(join(root, 'b.ts'), [join(root, 'c.ts'), join(root, 'd.ts')])
    graph.set(join(root, 'c.ts'), [join(root, 'e.ts')])

    const diagram = graphToMermaid(root, graph, { maxNodes: 10, maxEdges: 1 })
    expect(diagram.edgeCount).toBe(1)
    expect(diagram.truncated).toBe(true)
  })

  it('buildClassDiagram строит Mermaid classDiagram для TS/Java/C#', async () => {
    writeFileSync(
      join(root, 'src', 'animal.ts'),
      [
        'export class Animal {',
        '  age: number',
        '  run() { return this.age }',
        '}',
        '',
        'export class Dog extends Animal {',
        '  bark() { return "woof" }',
        '}',
        '',
        'export interface Pet {',
        '  name: string',
        '}'
      ].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'Animal.java'),
      [
        'public class Animal {',
        '  public int age;',
        '  public void run() {}',
        '}',
        '',
        'public class Dog extends Animal {',
        '  public void bark() {}',
        '}'
      ].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'Creature.cs'),
      [
        'public class Creature {',
        '  public int Age { get; set; }',
        '  public void Move() {}',
        '}',
        '',
        'public class Cat : Creature {',
        '  public void Meow() {}',
        '}'
      ].join('\n')
    )

    const result = await buildClassDiagram(root)
    expect(result.classCount).toBeGreaterThanOrEqual(4)
    expect(result.mermaid).toContain('classDiagram')
    expect(result.mermaid).toContain('Animal')
    expect(result.mermaid).toContain('Dog')
    expect(result.mermaid).toContain('Cat')
    expect(result.mermaid).toContain('Animal <|-- Dog')
    expect(result.mermaid).toContain('+run')
    expect(result.mermaid).toContain('+bark')

    const formatted = formatClassDiagram(result)
    expect(formatted).toContain('```mermaid')
    expect(formatted).toContain('classDiagram')
  })

  it('classesToMermaid отражает implements и interface', () => {
    const classes: ClassDiagramClass[] = [
      {
        name: 'Worker',
        filePath: join(root, 'worker.ts'),
        kind: 'interface',
        extends: [],
        implements: [],
        members: [{ name: 'work', visibility: '+' }]
      },
      {
        name: 'Employee',
        filePath: join(root, 'employee.ts'),
        kind: 'class',
        extends: [],
        implements: ['Worker'],
        members: [{ name: 'work', visibility: '+' }]
      }
    ]

    const diagram = classesToMermaid(classes)
    expect(diagram.mermaid).toContain('classDiagram')
    expect(diagram.mermaid).toContain('<<interface>>')
    expect(diagram.mermaid).toContain('Worker <|.. Employee')
    expect(diagram.relationCount).toBe(1)
  })

  it('buildDataflowDiagram строит Mermaid flowchart IPC/HTTP/FS', async () => {
    writeFileSync(
      join(root, 'src', 'main.ts'),
      [
        "import { ipcMain } from 'electron'",
        "import { readFile, writeFile } from 'fs/promises'",
        '',
        "ipcMain.handle('load-settings', async () => readFile('settings.json', 'utf-8'))",
        "export async function save(data: string) { await writeFile('out.json', data) }"
      ].join('\n')
    )
    writeFileSync(
      join(root, 'src', 'App.tsx'),
      [
        'export async function load() {',
        "  const res = await fetch('https://api.example.com/data')",
        '  return window.codeviper.loadSettings()',
        '}'
      ].join('\n')
    )

    const result = await buildDataflowDiagram(root)
    expect(result.edgeCount).toBeGreaterThanOrEqual(4)
    expect(result.mermaid).toContain('flowchart LR')
    expect(result.mermaid).toContain('EXT_IPC')
    expect(result.mermaid).toContain('EXT_HTTP')
    expect(result.mermaid).toContain('EXT_FS')
    expect(result.mermaid).toContain('main.ts')
    expect(result.mermaid).toContain('App.tsx')

    const formatted = formatDataflowDiagram(result)
    expect(formatted).toContain('```mermaid')
    expect(formatted).toContain('flowchart LR')
  })

  it('dataflowToMermaid обрезает DFD по лимиту потоков', () => {
    const flows = new Map<string, Array<{ kind: 'http' | 'fs_read'; detail?: string }>>()
    flows.set(join(root, 'a.ts'), [
      { kind: 'http', detail: 'fetch' },
      { kind: 'fs_read', detail: 'readFile' }
    ])
    flows.set(join(root, 'b.ts'), [{ kind: 'http', detail: 'axios' }])

    const diagram = dataflowToMermaid(root, flows, { maxNodes: 10, maxEdges: 1 })
    expect(diagram.edgeCount).toBe(1)
    expect(diagram.truncated).toBe(true)
  })
})
