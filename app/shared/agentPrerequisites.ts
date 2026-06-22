export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export type AgentPrerequisiteIssue =
  | { type: 'ollama_offline' }
  | { type: 'no_model'; suggestedModels: string[] }
  | { type: 'node_install'; packageManager: PackageManager; installCommand: string }

export interface AgentPrerequisitesResult {
  ok: boolean
  issues: AgentPrerequisiteIssue[]
}

export const DEFAULT_SUGGESTED_MODELS = ['qwen2.5-coder:7b', 'llama3.1:8b', 'qwen3:8b'] as const

const DEPENDENCY_SECTION_KEYS = [
  'dependencies',
  'devDependencies',
  'optionalDependencies',
  'peerDependencies'
] as const

/** true если в package.json есть секции с пакетами для установки */
export function packageJsonRequiresNodeInstall(
  pkg: Record<string, unknown> | null | undefined
): boolean {
  if (!pkg) return false
  for (const key of DEPENDENCY_SECTION_KEYS) {
    const section = pkg[key]
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      if (Object.keys(section as Record<string, unknown>).length > 0) return true
    }
  }
  return false
}

export function detectPackageManager(files: { pnpmLock: boolean; yarnLock: boolean }): {
  packageManager: PackageManager
  installCommand: string
} {
  if (files.pnpmLock) {
    return { packageManager: 'pnpm', installCommand: 'pnpm install' }
  }
  if (files.yarnLock) {
    return { packageManager: 'yarn', installCommand: 'yarn install' }
  }
  return { packageManager: 'npm', installCommand: 'npm install' }
}

export function formatPrerequisitesMessage(issues: AgentPrerequisiteIssue[]): string {
  const lines = ['⚠️ Перед запуском агента нужно установить зависимости:']

  for (const issue of issues) {
    if (issue.type === 'ollama_offline') {
      lines.push('• Ollama не запущена — установите с ollama.com и запустите приложение')
    }
    if (issue.type === 'no_model') {
      lines.push(`• Нет модели с tool calling — скачайте: ${issue.suggestedModels.join(', ')}`)
    }
    if (issue.type === 'node_install') {
      lines.push(`• Не установлены npm-зависимости проекта — выполните \`${issue.installCommand}\``)
    }
  }

  return lines.join('\n')
}
