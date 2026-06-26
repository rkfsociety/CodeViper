import { describe, it, expect, vi, beforeEach } from 'vitest'

const appState = vi.hoisted(() => ({
  isPackaged: false,
  appPath: 'C:/Apps/CodeViper/resources/app.asar',
  resourcesPath: 'C:/Apps/CodeViper/resources'
}))

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return appState.isPackaged
    },
    getAppPath: () => appState.appPath
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn((path: string) => String(path).replace(/\\/g, '/').includes('icon.ico'))
}))

import { getAppIconCandidates, resolveAppIconPath } from '../electron/main/appIcon'

describe('resolveAppIconPath', () => {
  beforeEach(() => {
    appState.isPackaged = false
    vi.clearAllMocks()
  })

  it('возвращает первый существующий путь из кандидатов', () => {
    const resolved = resolveAppIconPath()
    expect(resolved).toBeDefined()
    expect(resolved!.replace(/\\/g, '/')).toContain('icon.ico')
  })

  it('в packaged-режиме проверяет process.resourcesPath первым', () => {
    appState.isPackaged = true
    Object.defineProperty(process, 'resourcesPath', {
      value: appState.resourcesPath,
      configurable: true
    })

    const firstIcon = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    const candidates = getAppIconCandidates()
    expect(candidates[0].replace(/\\/g, '/')).toBe(
      `${appState.resourcesPath}/${firstIcon}`.replace(/\\/g, '/')
    )
  })
})
