import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'events'
import { join } from 'path'
import {
  launchDetachedWindowsInstaller,
  resolveWindowsPendingInstaller
} from '../shared/updateInstall'

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

describe('launchDetachedWindowsInstaller', () => {
  it('handles async spawn errors without unhandled error', () => {
    const child = new EventEmitter() as EventEmitter & { unref: () => void }
    let unrefCalled = false
    const errors: string[] = []
    child.unref = () => {
      unrefCalled = true
    }

    const started = launchDetachedWindowsInstaller(
      'C:\\Users\\USSR\\AppData\\Local\\codeviper-updater\\pending\\CodeViper-Setup.exe',
      () => child,
      (err) => errors.push(err.message)
    )

    child.emit('error', Object.assign(new Error('spawn EACCES'), { code: 'EACCES' }))

    expect(started).toBe(true)
    expect(unrefCalled).toBe(true)
    expect(errors).toEqual(['spawn EACCES'])
  })
})
