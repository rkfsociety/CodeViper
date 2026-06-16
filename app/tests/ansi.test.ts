import { describe, it, expect } from 'vitest'
import { parseAnsi } from '../shared/ansi'

const ESC = String.fromCharCode(27)

describe('parseAnsi', () => {
  it('возвращает один сегмент для текста без кодов', () => {
    const segments = parseAnsi('обычный текст')
    expect(segments).toEqual([{ text: 'обычный текст' }])
  })

  it('применяет цвет к части текста', () => {
    const segments = parseAnsi(`${ESC}[31mошибка${ESC}[0m ok`)
    expect(segments).toHaveLength(2)
    expect(segments[0]).toMatchObject({ text: 'ошибка', color: '#f85149' })
    expect(segments[1]).toMatchObject({ text: ' ok' })
    expect(segments[1].color).toBeUndefined()
  })

  it('сбрасывает стиль по ESC[0m', () => {
    const segments = parseAnsi(`${ESC}[1;32mok${ESC}[0mdone`)
    expect(segments[0]).toMatchObject({ text: 'ok', bold: true, color: '#3fb950' })
    expect(segments[1]).toEqual({ text: 'done' })
  })

  it('пустой ESC[m эквивалентен сбросу', () => {
    const segments = parseAnsi(`${ESC}[33mwarn${ESC}[mtail`)
    expect(segments[0]).toMatchObject({ text: 'warn', color: '#d29922' })
    expect(segments[1]).toEqual({ text: 'tail' })
  })

  it('разбирает truecolor 38;2;r;g;b', () => {
    const segments = parseAnsi(`${ESC}[38;2;255;0;0mred`)
    expect(segments[0]).toMatchObject({ text: 'red', color: '#ff0000' })
  })
})
