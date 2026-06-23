import { describe, expect, it } from 'vitest'
import { trayTooltip } from '../shared/trayStatus'

describe('trayTooltip', () => {
  it('покой — только название', () => {
    expect(trayTooltip(0)).toBe('CodeViper')
  })

  it('один активный чат', () => {
    expect(trayTooltip(1)).toBe('CodeViper — агент работает (1 чат)')
  })

  it('несколько чатов — склонение', () => {
    expect(trayTooltip(3)).toBe('CodeViper — агент работает (3 чата)')
    expect(trayTooltip(5)).toBe('CodeViper — агент работает (5 чатов)')
  })
})
