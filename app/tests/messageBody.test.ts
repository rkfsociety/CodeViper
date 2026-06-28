import { describe, it, expect } from 'vitest'
import React from 'react'
import { extractCodeBlockText } from '../src/components/MessageBody'

describe('MessageBody', () => {
  it('extractCodeBlockText извлекает текст из pre/code', () => {
    const tree = React.createElement('code', { className: 'language-ts' }, 'export const x = 1')
    expect(extractCodeBlockText(tree)).toBe('export const x = 1')
  })

  it('extractCodeBlockText склеивает массив дочерних узлов', () => {
    expect(extractCodeBlockText(['line1\n', 'line2'])).toBe('line1\nline2')
  })
})
