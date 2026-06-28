import { describe, expect, it } from 'vitest'
import {
  buildUpdateBannerView,
  mergePendingUpdate,
  type PendingUpdates
} from '../shared/updateBannerView'

const empty: PendingUpdates = { release: null, runtime: null, git: null }

describe('mergePendingUpdate', () => {
  it('накапливает release и runtime без перезаписи', () => {
    const afterRelease = mergePendingUpdate(empty, {
      source: 'release',
      version: '0.3.26',
      ready: false,
      percent: 10
    })
    const both = mergePendingUpdate(afterRelease, {
      source: 'runtime',
      ready: true,
      localHead: 'abc123456789'
    })

    expect(both.release?.version).toBe('0.3.26')
    expect(both.runtime?.localHead).toBe('abc123456789')
  })

  it('обновляет прогресс release на месте', () => {
    const base = mergePendingUpdate(empty, {
      source: 'release',
      version: '0.3.26',
      ready: false,
      percent: 10
    })
    const updated = mergePendingUpdate(base, {
      source: 'release',
      version: '0.3.26',
      ready: false,
      percent: 80
    })
    expect(updated.release?.percent).toBe(80)
  })
})

describe('buildUpdateBannerView', () => {
  it('объединяет готовые release и runtime в один текст', () => {
    const view = buildUpdateBannerView({
      release: { source: 'release', version: '0.3.26', ready: true },
      runtime: { source: 'runtime', ready: true, localHead: 'deadbeef1234' },
      git: null
    })

    expect(view.visible).toBe(true)
    expect(view.canInstall).toBe(true)
    expect(view.installLabel).toBe('Перезапустить и обновить')
    expect(view.title).toContain('0.3.26')
    expect(view.title).toContain('deadbee')
    expect(view.title).toContain('Одного перезапуска')
  })

  it('при загрузке release и готовом runtime блокирует основную кнопку', () => {
    const view = buildUpdateBannerView({
      release: { source: 'release', version: '0.3.26', ready: false, percent: 42 },
      runtime: { source: 'runtime', ready: true, localHead: 'cafebabe' },
      git: null
    })

    expect(view.canInstall).toBe(false)
    expect(view.installLabel).toBe('Ожидание установщика…')
    expect(view.title).toContain('Загружается установщик')
    expect(view.releasePercent).toBe(42)
  })
})
