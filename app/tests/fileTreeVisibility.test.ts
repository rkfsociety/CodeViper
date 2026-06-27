import { describe, it, expect, beforeEach, vi } from 'vitest'
import { loadFileTreeVisible, saveFileTreeVisible } from '../src/lib/fileTreeVisibility'

describe('fileTreeVisibility', () => {
  const store = new Map<string, string>()

  beforeEach(() => {
    store.clear()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      }
    })
  })

  it('по умолчанию дерево файлов видимо', () => {
    expect(loadFileTreeVisible()).toBe(true)
  })

  it('saveFileTreeVisible сохраняет false', () => {
    saveFileTreeVisible(false)
    expect(loadFileTreeVisible()).toBe(false)
  })

  it('saveFileTreeVisible сохраняет true', () => {
    saveFileTreeVisible(false)
    saveFileTreeVisible(true)
    expect(loadFileTreeVisible()).toBe(true)
  })
})
