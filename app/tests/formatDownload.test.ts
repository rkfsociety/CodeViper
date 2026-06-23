import { describe, expect, it } from 'vitest'
import {
  estimateRemainingSeconds,
  formatBytes,
  formatRemaining,
  formatSpeed
} from '../shared/formatDownload'

describe('formatDownload', () => {
  it('formatBytes — B, KB, MB, GB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB')
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.25 GB')
    expect(formatBytes(null)).toBeNull()
  })

  it('formatSpeed добавляет /s', () => {
    expect(formatSpeed(2 * 1024 ** 2)).toBe('2.0 MB/s')
  })

  it('formatRemaining — минуты и часы', () => {
    expect(formatRemaining(30)).toBe('< 1 мин')
    expect(formatRemaining(120)).toBe('~2 мин')
    expect(formatRemaining(7200)).toBe('~2 ч')
  })

  it('estimateRemainingSeconds по скорости и объёму', () => {
    expect(estimateRemainingSeconds(50, 100, 10)).toBe(5)
    expect(estimateRemainingSeconds(100, 100, 10)).toBeNull()
  })
})
