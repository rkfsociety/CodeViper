import { describe, it, expect } from 'vitest'
import {
  buildSideBySideRows,
  languageFromPath,
  parseUnifiedDiffLines,
  reconstructDiffSides
} from '../shared/diffPreview'

const SAMPLE_DIFF = `--- a/src/app.ts
+++ b/src/app.ts
@@ -1,3 +1,3 @@
 export function oldName() {
-  return 1
+  return 2
 }
`

describe('diffPreview', () => {
  it('parseUnifiedDiffLines разбирает unified diff', () => {
    const lines = parseUnifiedDiffLines(SAMPLE_DIFF)
    expect(lines.some((l) => l.kind === 'removed' && l.text.includes('return 1'))).toBe(true)
    expect(lines.some((l) => l.kind === 'added' && l.text.includes('return 2'))).toBe(true)
  })

  it('buildSideBySideRows формирует два столбца', () => {
    const rows = buildSideBySideRows(SAMPLE_DIFF)
    const removed = rows.find((r) => r.leftKind === 'removed')
    const added = rows.find((r) => r.rightKind === 'added')
    expect(removed?.left).toContain('return 1')
    expect(removed?.right).toBeNull()
    expect(added?.right).toContain('return 2')
    expect(added?.left).toBeNull()
    expect(rows.some((r) => r.leftKind === 'context' && r.rightKind === 'context')).toBe(true)
  })

  it('reconstructDiffSides восстанавливает старую и новую версии', () => {
    const { oldText, newText } = reconstructDiffSides(SAMPLE_DIFF)
    expect(oldText).toContain('return 1')
    expect(newText).toContain('return 2')
    expect(oldText).not.toContain('return 2')
  })

  it('languageFromPath определяет typescript для .tsx', () => {
    expect(languageFromPath('src/App.tsx')).toBe('typescript')
  })
})
