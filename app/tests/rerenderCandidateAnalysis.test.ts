import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findRerenderCandidates,
  formatRerenderCandidatesOutput
} from '../electron/main/rerenderCandidateAnalysis'

describe('rerenderCandidateAnalysis', () => {
  let root: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'cv-rerender-'))
    mkdirSync(join(root, 'app', 'src', 'components'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('находит экспортируемые компоненты с props без memo хуков', async () => {
    writeFileSync(
      join(root, 'app', 'src', 'components', 'Card.tsx'),
      [
        'type CardProps = { title: string }',
        'export function Card(props: CardProps) {',
        '  return <div>{props.title}</div>',
        '}',
        'export const Badge = (props: { label: string }) => {',
        '  return <span>{props.label}</span>',
        '}'
      ].join('\n')
    )

    const result = await findRerenderCandidates(root, { subpath: 'app/src/components' })
    expect(result.issues.map((issue) => issue.name)).toEqual(
      expect.arrayContaining(['Card', 'Badge'])
    )
    expect(formatRerenderCandidatesOutput(root, result)).toContain('find_rerender_candidates')
  })

  it('пропускает memoизированные компоненты и не находит чистый файл', async () => {
    writeFileSync(
      join(root, 'app', 'src', 'components', 'Memo.tsx'),
      [
        'import { memo, useCallback, useMemo } from "react"',
        'type MemoProps = { items: string[] }',
        'export const Memo = memo(function Memo(props: MemoProps) {',
        '  const handleClick = useCallback(() => props.items.length, [props.items])',
        '  const value = useMemo(() => props.items.join(","), [props.items])',
        '  return <button onClick={handleClick}>{value}</button>',
        '})'
      ].join('\n')
    )

    const result = await findRerenderCandidates(root, { subpath: 'app/src/components/Memo.tsx' })
    expect(result.issues).toHaveLength(0)
    expect(formatRerenderCandidatesOutput(root, result)).toContain('не найдены')
  })

  it('пропускает компонент если внутри него уже есть useMemo или useCallback', async () => {
    writeFileSync(
      join(root, 'app', 'src', 'components', 'Hooks.tsx'),
      [
        'import { useCallback, useMemo } from "react"',
        'type HooksProps = { items: string[]; onPick(id: string): void }',
        'export function Hooks(props: HooksProps) {',
        '  const value = useMemo(() => props.items.join(","), [props.items])',
        '  const handlePick = useCallback(() => props.onPick(value), [props, value])',
        '  return <button onClick={handlePick}>{value}</button>',
        '}'
      ].join('\n')
    )

    const result = await findRerenderCandidates(root, { subpath: 'app/src/components/Hooks.tsx' })
    expect(result.issues).toHaveLength(0)
  })
})
