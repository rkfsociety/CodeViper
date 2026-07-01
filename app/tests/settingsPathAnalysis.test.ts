import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  findSettingsPathIssues,
  formatSettingsPathIssuesOutput
} from '../electron/main/settingsPathAnalysis'
import * as settingsModule from '../electron/main/settings'

describe('settingsPathAnalysis', () => {
  let userDataDir: string
  let settingsPath: string

  beforeEach(() => {
    userDataDir = mkdtempSync(join(tmpdir(), 'cv-settings-'))
    settingsPath = join(userDataDir, 'settings.json')
    vi.spyOn(settingsModule, 'loadSettings').mockImplementation(async () => {
      const raw = JSON.parse(readFileSync(settingsPath, 'utf8')) as any
      return raw
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    rmSync(userDataDir, { recursive: true, force: true })
  })

  it('reports missing path-like settings entries', async () => {
    const projectDir = join(userDataDir, 'project')
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          version: 1,
          ollamaUrl: 'http://127.0.0.1:11434',
          model: '',
          selfLearning: true,
          autoModel: true,
          permissionMode: 'acceptEdits',
          clarifyMode: false,
          deepReasoning: false,
          excludeThinkingFromHistory: true,
          summarizeModel: '',
          modelProvider: 'ollama',
          providerApiKey: '',
          deepseekApiKey: '',
          openaiApiKey: '',
          literouterApiKey: '',
          literouterBaseUrl: '',
          openrouterApiKey: '',
          geminiApiKey: '',
          geminiRpm: 5,
          geminiTier: 'free',
          openrouterTier: 'free',
          literouterTier: 'free',
          claudeApiKey: '',
          groqApiKey: '',
          togetherApiKey: '',
          customBaseUrl: '',
          customApiKey: '',
          fallbackModels: [],
          gitSyncOnStartup: true,
          gitSyncStrategy: 'stash',
          enabledPlugins: [],
          sourceRootOverride: join(userDataDir, 'missing-source'),
          gitRepoRoot: projectDir,
          orchestratorModelPath: join(userDataDir, 'missing-model.gguf'),
          recentProjects: [projectDir, join(userDataDir, 'missing-recent')]
        },
        null,
        2
      )
    )

    const result = await findSettingsPathIssues()
    expect(result.issues.some((issue) => issue.key === 'sourceRootOverride')).toBe(true)
    expect(result.issues.some((issue) => issue.key === 'gitRepoRoot')).toBe(false)
    expect(result.issues.some((issue) => issue.key === 'orchestratorModelPath')).toBe(true)
    expect(result.issues.filter((issue) => issue.key === 'recentProjects')).toHaveLength(1)
    expect(formatSettingsPathIssuesOutput(result)).toContain('find_settings_path_issues')
  })

  it('returns clean report when all configured paths exist', async () => {
    const projectDir = join(userDataDir, 'project')
    const sourceDir = join(projectDir, 'app')
    mkdirSync(sourceDir, { recursive: true })
    const modelPath = join(userDataDir, 'model.gguf')
    writeFileSync(modelPath, 'model')
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          version: 1,
          ollamaUrl: 'http://127.0.0.1:11434',
          model: '',
          selfLearning: true,
          autoModel: true,
          permissionMode: 'acceptEdits',
          clarifyMode: false,
          deepReasoning: false,
          excludeThinkingFromHistory: true,
          summarizeModel: '',
          modelProvider: 'ollama',
          providerApiKey: '',
          deepseekApiKey: '',
          openaiApiKey: '',
          literouterApiKey: '',
          literouterBaseUrl: '',
          openrouterApiKey: '',
          geminiApiKey: '',
          geminiRpm: 5,
          geminiTier: 'free',
          openrouterTier: 'free',
          literouterTier: 'free',
          claudeApiKey: '',
          groqApiKey: '',
          togetherApiKey: '',
          customBaseUrl: '',
          customApiKey: '',
          fallbackModels: [],
          gitSyncOnStartup: true,
          gitSyncStrategy: 'stash',
          enabledPlugins: [],
          sourceRootOverride: sourceDir,
          gitRepoRoot: projectDir,
          orchestratorModelPath: modelPath,
          recentProjects: [projectDir]
        },
        null,
        2
      )
    )

    const result = await findSettingsPathIssues()
    expect(result.issues).toHaveLength(0)
    expect(formatSettingsPathIssuesOutput(result)).toContain('битых путей не найдено')
  })
})
