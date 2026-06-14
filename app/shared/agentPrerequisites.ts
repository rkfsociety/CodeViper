export type PackageManager = 'npm' | 'pnpm' | 'yarn'

export type AgentPrerequisiteIssue =
  | { type: 'ollama_offline' }
  | { type: 'no_model'; suggestedModels: string[] }
  | { type: 'node_install'; packageManager: PackageManager; installCommand: string }

export interface AgentPrerequisitesResult {
  ok: boolean
  issues: AgentPrerequisiteIssue[]
}

export const DEFAULT_SUGGESTED_MODELS = [
  'qwen2.5-coder:7b',
  'llama3.1:8b',
  'qwen2.5-coder:3b'
] as const

export function detectPackageManager(files: {
  pnpmLock: boolean
  yarnLock: boolean
}): { packageManager: PackageManager; installCommand: string } {
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
