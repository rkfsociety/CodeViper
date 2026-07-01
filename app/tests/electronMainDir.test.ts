import { describe, expect, it } from 'vitest'
import { pathToFileURL } from 'url'
import { join, resolve } from 'path'
import { resolveElectronMainDir } from '../electron/main/electronMainDir'

describe('resolveElectronMainDir', () => {
  it('предпочитает __dirname когда задан (asar / dev entry)', () => {
    expect(resolveElectronMainDir('C:\\app\\out\\main', 'file:///ignored.js')).toBe(
      'C:\\app\\out\\main'
    )
  })

  it('fallback на import.meta.url в ESM-бандле live runtime', () => {
    const bundle = pathToFileURL(resolve('C:/app/out/main/runtimeHandlers.js')).href
    expect(resolveElectronMainDir(undefined, bundle)).toBe(resolve('C:/app/out/main'))
  })

  it('воркер лежит рядом с бандлом', () => {
    const bundle = pathToFileURL(join('C:', 'app', 'out', 'main', 'runtimeHandlers.js')).href
    const mainDir = resolveElectronMainDir(undefined, bundle)
    expect(join(mainDir, 'fileSearchWorker.js')).toBe(
      resolve('C:/app/out/main/fileSearchWorker.js')
    )
  })
})
