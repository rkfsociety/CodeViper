import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/window' },
  screen: {
    getAllDisplays: () => [
      { workArea: { x: 0, y: 0, width: 1920, height: 1080 } }
    ]
  }
}))

import { isWindowStateOnScreen, normalizeWindowState } from '../electron/main/windowState'

describe('normalizeWindowState', () => {
  it('подставляет значения по умолчанию', () => {
    expect(normalizeWindowState({})).toEqual({
      version: 1,
      width: 1280,
      height: 820,
      isMaximized: false
    })
  })

  it('ограничивает минимальный размер', () => {
    expect(normalizeWindowState({ width: 400, height: 300 })).toEqual({
      version: 1,
      width: 960,
      height: 640,
      isMaximized: false
    })
  })

  it('сохраняет координаты и maximize', () => {
    expect(
      normalizeWindowState({ width: 1200, height: 700, x: 120, y: 80, isMaximized: true })
    ).toEqual({
      version: 1,
      width: 1200,
      height: 700,
      x: 120,
      y: 80,
      isMaximized: true
    })
  })
})

describe('isWindowStateOnScreen', () => {
  it('true для окна внутри экрана', () => {
    expect(
      isWindowStateOnScreen(
        normalizeWindowState({ width: 1000, height: 700, x: 100, y: 100 })
      )
    ).toBe(true)
  })

  it('false для окна полностью вне экрана', () => {
    expect(
      isWindowStateOnScreen(
        normalizeWindowState({ width: 1000, height: 700, x: 5000, y: 5000 })
      )
    ).toBe(false)
  })
})
