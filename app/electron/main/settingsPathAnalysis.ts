import { access } from 'fs/promises'
import { resolve } from 'path'
import { loadSettings, type PersistedSettings } from './settings'

export interface SettingsPathIssue {
  key: string
  path: string
  message: string
}

export interface SettingsPathAnalysisResult {
  issues: SettingsPathIssue[]
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function pushIssue(issues: SettingsPathIssue[], key: string, path: string): void {
  issues.push({
    key,
    path,
    message: 'Путь не существует'
  })
}

async function collectSettingsPathIssues(
  settings: PersistedSettings
): Promise<SettingsPathIssue[]> {
  const issues: SettingsPathIssue[] = []

  const checkSingle = async (key: string, value?: string | null) => {
    const trimmed = value?.trim()
    if (!trimmed) return
    if (!(await pathExists(resolve(trimmed)))) {
      pushIssue(issues, key, trimmed)
    }
  }

  await checkSingle('sourceRootOverride', settings.sourceRootOverride)
  await checkSingle('gitRepoRoot', settings.gitRepoRoot)
  await checkSingle('orchestratorModelPath', settings.orchestratorModelPath)

  for (const projectPath of settings.recentProjects ?? []) {
    const trimmed = projectPath.trim()
    if (!trimmed) continue
    if (!(await pathExists(resolve(trimmed)))) {
      pushIssue(issues, 'recentProjects', trimmed)
    }
  }

  return issues
}

export async function findSettingsPathIssues(): Promise<SettingsPathAnalysisResult> {
  const settings = await loadSettings()
  return { issues: await collectSettingsPathIssues(settings) }
}

export function formatSettingsPathIssuesOutput(result: SettingsPathAnalysisResult): string {
  if (!result.issues.length) {
    return 'settings.json: битых путей не найдено'
  }

  const lines = result.issues.map(
    (issue, index) => `[${index + 1}] ${issue.key}: ${issue.path} — ${issue.message}`
  )
  return ['find_settings_path_issues', ...lines].join('\n')
}
