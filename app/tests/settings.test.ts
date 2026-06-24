import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Моки (hoisted — поднимаются до импортов) ─────────────────────────────────

const { mockEncryptString, mockDecryptString } = vi.hoisted(() => ({
  mockEncryptString: vi.fn((s: string) => Buffer.from(s)),
  mockDecryptString: vi.fn((b: Buffer) => b.toString())
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/vitest-settings',
    getVersion: () => '0.0.0'
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  }
}))

const mockWriteFile = vi.hoisted(() => vi.fn())

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: () => false }
})

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return { ...actual, writeFile: mockWriteFile, mkdir: vi.fn(), rename: vi.fn() }
})

import { saveSettings } from '../electron/main/settings'
import type { AgentSettings } from '../src/types'

// ── Базовые настройки ────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    model: 'llama3',
    modelProvider: 'ollama',
    ollamaUrl: 'http://localhost:11434',
    openaiApiKey: '',
    deepseekApiKey: '',
    openrouterApiKey: '',
    geminiApiKey: '',
    qdrantApiKey: '',
    milvusApiKey: '',
    systemPrompt: '',
    permissionMode: 'ask',
    ...overrides
  } as AgentSettings
}

// ── Тесты encryptApiKey через saveSettings ───────────────────────────────────

describe('encryptApiKey', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEncryptString.mockImplementation((s: string) => Buffer.from(s))
    mockWriteFile.mockResolvedValue(undefined)
  })

  it('вызывает safeStorage.encryptString при непустом ключе', async () => {
    await saveSettings(makeSettings({ openaiApiKey: 'sk-test-key' }))
    expect(mockEncryptString).toHaveBeenCalledWith('sk-test-key')
  })

  it('не вызывает encryptString для пустого ключа', async () => {
    await saveSettings(makeSettings({ openaiApiKey: '' }))
    expect(mockEncryptString).not.toHaveBeenCalled()
  })

  it('при ошибке шифрования: ключ не попадает в файл, логируется критическая ошибка', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockEncryptString.mockImplementationOnce(() => {
      throw new Error('keychain locked')
    })

    // saveSettings не должна выбрасывать
    await expect(saveSettings(makeSettings({ openaiApiKey: 'sk-secret' }))).resolves.not.toThrow()

    // Проверяем что в записанный JSON попало '' вместо 'sk-secret'
    const calls = mockWriteFile.mock.calls
    const jsonCall = calls.find((args: unknown[]) => String(args[1]).includes('openaiApiKey'))
    expect(jsonCall).toBeDefined()
    const parsed = JSON.parse(String(jsonCall![1])) as Record<string, unknown>
    expect(parsed.openaiApiKey).toBe('')
    expect(parsed.openaiApiKey).not.toBe('sk-secret')

    // Критическая ошибка залогирована
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('КРИТИЧЕСКАЯ ОШИБКА'),
      expect.any(Error)
    )
    consoleSpy.mockRestore()
  })
})
