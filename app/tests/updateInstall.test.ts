import { describe, expect, it } from 'vitest'
import { join } from 'path'
import { resolveWindowsPendingInstaller } from '../shared/updateInstall'

describe('resolveWindowsPendingInstaller', () => {
  it('возвращает null если update-info.json отсутствует', () => {
    expect(resolveWindowsPendingInstaller('/tmp/no-such-dir')).toBeNull()
  })

  it('собирает путь из fileName в update-info.json', () => {
    const base = join(process.cwd(), 'tests', 'fixtures', 'update-pending')
    const installer = resolveWindowsPendingInstaller(base)
    expect(installer).toBe(join(base, 'codeviper-updater', 'pending', 'CodeViper-Setup-0.2.1.exe'))
  })
})
