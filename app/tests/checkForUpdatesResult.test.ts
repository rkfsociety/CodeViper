import { describe, expect, it } from 'vitest'
import {
  CheckForUpdatesResultSchema,
  formatCheckForUpdatesMessage
} from '../shared/checkForUpdatesResult'

describe('formatCheckForUpdatesMessage', () => {
  it('сообщает об актуальном установщике и runtime', () => {
    const result = CheckForUpdatesResultSchema.parse({
      ok: true,
      currentVersion: '0.3.51',
      packaged: true,
      release: { checked: true, status: 'upToDate', version: '0.3.51' },
      runtime: { checked: true, status: 'upToDate' },
      message: ''
    })
    expect(formatCheckForUpdatesMessage(result)).toBe(
      'Установщик v0.3.51 актуален. Agent runtime актуален'
    )
  })

  it('сообщает о доступном runtime и установщике', () => {
    const result = CheckForUpdatesResultSchema.parse({
      ok: true,
      currentVersion: '0.3.50',
      packaged: true,
      release: { checked: true, status: 'available', version: '0.3.51' },
      runtime: { checked: true, status: 'available', commitsBehind: 3 },
      message: ''
    })
    expect(formatCheckForUpdatesMessage(result)).toBe(
      'Доступен установщик v0.3.51. На GitHub 3 коммит(ов) runtime'
    )
  })

  it('в dev-режиме говорит про исходники', () => {
    const result = CheckForUpdatesResultSchema.parse({
      ok: true,
      currentVersion: '0.3.51',
      packaged: false,
      release: { checked: false, status: 'skipped' },
      runtime: { checked: true, status: 'available', commitsBehind: 2 },
      message: ''
    })
    expect(formatCheckForUpdatesMessage(result)).toBe('На GitHub 2 коммит(ов) исходников')
  })
})
