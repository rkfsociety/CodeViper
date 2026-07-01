import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const stylesPath = resolve(__dirname, '../src/components/ChatPanel.module.css')
const styles = readFileSync(stylesPath, 'utf8')

function cssBlock(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = styles.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))
  return match?.[1] ?? ''
}

describe('ChatPanel styles', () => {
  it('limits model picker dropdown height and enables vertical scrolling', () => {
    const block = cssBlock('.modelPickerDropdown')

    expect(block).toMatch(/max-height\s*:/)
    expect(block).toMatch(/overflow-y\s*:\s*auto/)
  })
})
