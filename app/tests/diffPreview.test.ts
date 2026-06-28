import { describe, it, expect } from 'vitest'
import hljs from 'highlight.js/lib/common'
import {
  buildSideBySideRows,
  buildSourcePreviewLines,
  highlightSourceCode,
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

  it('highlightSourceCode подсвечивает TypeScript', () => {
    const highlight = (code: string, language: string) =>
      hljs.highlight(code, { language, ignoreIllegals: true }).value
    const html = highlightSourceCode('export const answer = 42', 'src/foo.ts', highlight)
    expect(html).toContain('hljs')
    expect(html).toMatch(/keyword|export|number/)
  })

  it('buildSourcePreviewLines разбивает на строки', () => {
    const highlight = (code: string, language: string) =>
      hljs.highlight(code, { language, ignoreIllegals: true }).value
    const lines = buildSourcePreviewLines('const a = 1\nconst b = 2', 'x.ts', highlight)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('hljs')
  })
})
