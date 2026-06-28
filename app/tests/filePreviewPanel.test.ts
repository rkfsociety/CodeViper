import { describe, it, expect } from 'vitest'
import { renderFilePreviewHtml } from '../src/components/FilePreviewPanel'

describe('FilePreviewPanel', () => {
  it('renderFilePreviewHtml подсвечивает .ts файл', () => {
    const html = renderFilePreviewHtml('export function hello(): void {}', 'app/src/foo.ts')
    expect(html).toContain('hljs')
    expect(html).toMatch(/function|keyword/)
  })
})
