import { describe, it, expect } from 'vitest'
import { applySearchReplace, parseToolBool, FileEditError } from '../shared/fileEdit'

describe('applySearchReplace', () => {
  it('заменяет одно вхождение', () => {
    const result = applySearchReplace('hello world', 'world', 'CodeViper')
    expect(result.content).toBe('hello CodeViper')
    expect(result.replacements).toBe(1)
  })

  it('заменяет все вхождения с replace_all', () => {
    const result = applySearchReplace('a-b-a-b', 'a', 'x', true)
    expect(result.content).toBe('x-b-x-b')
    expect(result.replacements).toBe(2)
  })

  it('ошибка при нескольких вхождениях без replace_all', () => {
    expect(() => applySearchReplace('foo bar foo', 'foo', 'baz')).toThrow(FileEditError)
  })

  it('ошибка если old_string не найден', () => {
    expect(() => applySearchReplace('abc', 'xyz', 'q')).toThrow(/не найден/)
  })

  it('заменяет при CRLF в файле и LF в old_string', () => {
    const result = applySearchReplace('line1\r\nfoo bar\r\nline3', 'foo bar', 'baz')
    expect(result.content).toBe('line1\r\nbaz\r\nline3')
    expect(result.replacements).toBe(1)
  })

  it('ошибка old_string содержит подсказку про offset/grep', () => {
    expect(() => applySearchReplace('abc', 'xyz', 'q')).toThrow(/offset\/limit/)
  })

  it('ошибка при пустом old_string', () => {
    expect(() => applySearchReplace('abc', '', 'x')).toThrow(/пустым/)
  })
})

describe('parseToolBool', () => {
  it('распознаёт true-значения', () => {
    expect(parseToolBool('true')).toBe(true)
    expect(parseToolBool('1')).toBe(true)
    expect(parseToolBool('yes')).toBe(true)
  })

  it('false по умолчанию', () => {
    expect(parseToolBool(undefined)).toBe(false)
    expect(parseToolBool('false')).toBe(false)
  })
})
