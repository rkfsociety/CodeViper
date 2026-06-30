import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  collectAriaIssuesForSource,
  formatAriaIssuesOutput
} from '../electron/main/ariaJsxAnalysis'

describe('ariaJsxAnalysis', () => {
  it('находит неизвестный aria-атрибут', () => {
    const issues = collectAriaIssuesForSource('Bad.tsx', '<button aria-typo="x">OK</button>')
    expect(issues.some((i) => i.rule === 'aria-invalid-attribute')).toBe(true)
  })

  it('находит img без alt', () => {
    const issues = collectAriaIssuesForSource('Bad.tsx', '<img src="logo.png" />')
    expect(issues.some((i) => i.rule === 'img-missing-alt')).toBe(true)
  })

  it('находит кликабельный span без a11y', () => {
    const issues = collectAriaIssuesForSource('Bad.tsx', '<span onClick={() => {}}>path.ts</span>')
    expect(issues.some((i) => i.rule === 'clickable-without-a11y')).toBe(true)
  })

  it('не ругается на span с role=button и aria-label', () => {
    const issues = collectAriaIssuesForSource(
      'Good.tsx',
      '<span role="button" tabIndex={0} aria-label="Open" onClick={() => {}}>path.ts</span>'
    )
    expect(issues.some((i) => i.rule === 'clickable-without-a11y')).toBe(false)
  })

  it('находит кнопку с emoji без aria-label', () => {
    const issues = collectAriaIssuesForSource(
      'Bad.tsx',
      '<button title="Theme">{light ? "🌙" : "☀️"}</button>'
    )
    expect(issues.some((i) => i.rule === 'button-weak-name')).toBe(true)
  })

  it('formatAriaIssuesOutput сообщает об отсутствии нарушений', () => {
    expect(formatAriaIssuesOutput([])).toBe('Нарушений доступности не найдено.')
  })

  it('MessageBody.tsx и App.tsx проходят find_aria_issues по умолчанию', () => {
    const root = join(__dirname, '..')
    for (const rel of ['src/components/MessageBody.tsx', 'src/App.tsx']) {
      const issues = collectAriaIssuesForSource(rel, readFileSync(join(root, rel), 'utf8'))
      expect(issues, rel).toEqual([])
    }
  })
})
