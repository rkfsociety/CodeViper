import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Моки (hoisted — поднимаются до импортов) ─────────────────────────────────

const { mockEncryptString, mockDecryptString, mockIsPackaged } = vi.hoisted(() => ({
  mockEncryptString: vi.fn((s: string) => Buffer.from(s)),
  mockDecryptString: vi.fn((b: Buffer) => b.toString()),
  mockIsPackaged: vi.fn(() => false)
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/vitest-settings',
    getVersion: () => '0.0.0',
    get isPackaged() {
      return mockIsPackaged()
    }
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn(() => true),
    encryptString: mockEncryptString,
    decryptString: mockDecryptString
  }
}))

const mockWriteFile = vi.hoisted(() => vi.fn())
const mockExistsSync = vi.hoisted(() => vi.fn(() => false))
const mockReadFile = vi.hoisted(() => vi.fn())

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return { ...actual, existsSync: mockExistsSync }
})

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    mkdir: vi.fn(),
    rename: vi.fn()
  }
})

import { loadSettings, saveSettings, defaultLiveRuntimeFromGit } from '../electron/main/settings'
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

// ── Миграция deprecated cloudApiKey ─────────────────────────────────────────

describe('cloudApiKey migration', () => {
  const enc = (s: string) => Buffer.from(s).toString('base64')

  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(true)
    mockDecryptString.mockImplementation((b: Buffer) => b.toString())
  })

  it('переносит cloudApiKey в openaiApiKey при загрузке старого конфига', async () => {
    const legacyConfig = {
      version: 1,
      ollamaUrl: 'http://127.0.0.1:11434',
      model: '',
      selfLearning: true,
      autoModel: true,
      permissionMode: 'acceptEdits',
      clarifyMode: false,
      deepReasoning: false,
      excludeThinkingFromHistory: true,
      autoPushSelfEdits: true,
      summarizeModel: '',
      modelProvider: 'ollama',
      providerApiKey: '',
      deepseekApiKey: '',
      openaiApiKey: '',
      openrouterApiKey: '',
      geminiApiKey: '',
      geminiRpm: 5,
      geminiTier: 'free',
      claudeApiKey: '',
      groqApiKey: '',
      togetherApiKey: '',
      gitSyncOnStartup: true,
      gitSyncStrategy: 'stash',
      cloudApiKey: 'sk-legacy-cloud-key'
    }
    mockReadFile.mockResolvedValue(JSON.stringify(legacyConfig))

    const loaded = await loadSettings()

    expect(loaded.openaiApiKey).toBe('sk-legacy-cloud-key')
    expect(loaded).not.toHaveProperty('cloudApiKey')
  })

  it('не перезаписывает openaiApiKey если уже задан', async () => {
    const legacyConfig = {
      version: 1,
      ollamaUrl: 'http://127.0.0.1:11434',
      model: '',
      selfLearning: true,
      autoModel: true,
      permissionMode: 'acceptEdits',
      clarifyMode: false,
      deepReasoning: false,
      excludeThinkingFromHistory: true,
      autoPushSelfEdits: true,
      summarizeModel: '',
      modelProvider: 'ollama',
      providerApiKey: '',
      deepseekApiKey: '',
      openaiApiKey: enc('sk-existing'),
      openrouterApiKey: '',
      geminiApiKey: '',
      geminiRpm: 5,
      geminiTier: 'free',
      claudeApiKey: '',
      groqApiKey: '',
      togetherApiKey: '',
      gitSyncOnStartup: true,
      gitSyncStrategy: 'stash',
      cloudApiKey: 'sk-legacy-cloud-key'
    }
    mockReadFile.mockResolvedValue(JSON.stringify(legacyConfig))

    const loaded = await loadSettings()

    expect(loaded.openaiApiKey).toBe('sk-existing')
  })
})

describe('liveRuntimeFromGit', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockExistsSync.mockReturnValue(false)
    mockWriteFile.mockResolvedValue(undefined)
    mockIsPackaged.mockReturnValue(false)
  })

  it('defaultLiveRuntimeFromGit: true для packaged', () => {
    mockIsPackaged.mockReturnValue(true)
    expect(defaultLiveRuntimeFromGit()).toBe(true)
  })

  it('defaultLiveRuntimeFromGit: false в dev', () => {
    mockIsPackaged.mockReturnValue(false)
    expect(defaultLiveRuntimeFromGit()).toBe(false)
  })

  it('сохраняет liveRuntimeFromGit: false в settings.json', async () => {
    const saved = await saveSettings(makeSettings({ liveRuntimeFromGit: false }))
    expect(saved.liveRuntimeFromGit).toBe(false)

    const jsonCall = mockWriteFile.mock.calls.find((args: unknown[]) =>
      String(args[1]).includes('liveRuntimeFromGit')
    )
    expect(jsonCall).toBeDefined()
    const parsed = JSON.parse(String(jsonCall![1])) as Record<string, unknown>
    expect(parsed.liveRuntimeFromGit).toBe(false)
  })

  it('при загрузке без поля — default true для packaged', async () => {
    mockIsPackaged.mockReturnValue(true)
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: 1,
        ollamaUrl: 'http://127.0.0.1:11434',
        model: '',
        selfLearning: true,
        autoModel: true,
        permissionMode: 'acceptEdits',
        clarifyMode: false,
        deepReasoning: false,
        excludeThinkingFromHistory: true,
        autoPushSelfEdits: true,
        summarizeModel: '',
        modelProvider: 'ollama',
        providerApiKey: '',
        deepseekApiKey: '',
        openaiApiKey: '',
        openrouterApiKey: '',
        geminiApiKey: '',
        geminiRpm: 5,
        geminiTier: 'free',
        claudeApiKey: '',
        groqApiKey: '',
        togetherApiKey: '',
        gitSyncOnStartup: true,
        gitSyncStrategy: 'stash'
      })
    )

    const loaded = await loadSettings()
    expect(loaded.liveRuntimeFromGit).toBe(true)
  })

  it('сохраняет и загружает uiLightMode', async () => {
    const saved = await saveSettings(makeSettings({ uiLightMode: true }))
    expect(saved.uiLightMode).toBe(true)

    const jsonCall = mockWriteFile.mock.calls.find((args: unknown[]) =>
      String(args[1]).includes('uiLightMode')
    )
    expect(jsonCall).toBeDefined()
    const parsed = JSON.parse(String(jsonCall![1])) as Record<string, unknown>
    expect(parsed.uiLightMode).toBe(true)

    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(String(jsonCall![1]))
    const loaded = await loadSettings()
    expect(loaded.uiLightMode).toBe(true)
  })

  it('сохраняет recentProjects в settings.json', async () => {
    const paths = ['C:/proj-a', 'C:/proj-b']
    const saved = await saveSettings(makeSettings({ recentProjects: paths }))
    expect(saved.recentProjects).toEqual(paths)

    const jsonCall = mockWriteFile.mock.calls.find((args: unknown[]) =>
      String(args[1]).includes('recentProjects')
    )
    expect(jsonCall).toBeDefined()
    const parsed = JSON.parse(String(jsonCall![1])) as Record<string, unknown>
    expect(parsed.recentProjects).toEqual(paths)
  })

  it('без uiLightMode в файле — тема тёмная (поле отсутствует)', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFile.mockResolvedValue(
      JSON.stringify({
        version: 1,
        ollamaUrl: 'http://127.0.0.1:11434',
        model: '',
        selfLearning: true,
        autoModel: true,
        permissionMode: 'acceptEdits',
        clarifyMode: false,
        deepReasoning: false,
        excludeThinkingFromHistory: true,
        autoPushSelfEdits: true,
        summarizeModel: '',
        modelProvider: 'ollama',
        providerApiKey: '',
        deepseekApiKey: '',
        openaiApiKey: '',
        openrouterApiKey: '',
        geminiApiKey: '',
        geminiRpm: 5,
        geminiTier: 'free',
        claudeApiKey: '',
        groqApiKey: '',
        togetherApiKey: '',
        gitSyncOnStartup: true,
        gitSyncStrategy: 'stash'
      })
    )

    const loaded = await loadSettings()
    expect(loaded.uiLightMode).toBeUndefined()
  })
})
