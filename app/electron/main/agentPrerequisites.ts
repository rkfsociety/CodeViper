import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import {
  DEFAULT_SUGGESTED_MODELS,
  detectPackageManager,
  type AgentPrerequisiteIssue,
  type AgentPrerequisitesResult
} from '../../shared/agentPrerequisites'
import { filterToolCallingModels } from '../../shared/recommendedModels'
import { fetchOllamaModels, pingOllama } from './agent'

export async function checkProjectNodeDependencies(
  projectPath: string
): Promise<AgentPrerequisiteIssue | null> {
  const root = projectPath.trim()
  if (!root) return null

  const packageJsonPath = join(root, 'package.json')
  if (!existsSync(packageJsonPath)) return null

  const nodeModulesPath = join(root, 'node_modules')
  let needsInstall = !existsSync(nodeModulesPath)

  if (!needsInstall) {
    try {
      const entries = await readdir(nodeModulesPath)
      if (entries.length === 0) needsInstall = true
    } catch {
      needsInstall = true
    }
  }

  if (!needsInstall) return null

  const { packageManager, installCommand } = detectPackageManager({
    pnpmLock: existsSync(join(root, 'pnpm-lock.yaml')),
    yarnLock: existsSync(join(root, 'yarn.lock'))
  })

  return {
    type: 'node_install',
    packageManager,
    installCommand
  }
}

export async function checkAgentPrerequisites(
  ollamaUrl: string,
  projectPath: string
): Promise<AgentPrerequisitesResult> {
  const issues: AgentPrerequisiteIssue[] = []

  const online = await pingOllama(ollamaUrl)
  if (!online) {
    issues.push({ type: 'ollama_offline' })
  } else {
    try {
      const installed = await fetchOllamaModels(ollamaUrl)
      if (filterToolCallingModels(installed).length === 0) {
        issues.push({
          type: 'no_model',
          suggestedModels: [...DEFAULT_SUGGESTED_MODELS]
        })
      }
    } catch {
      issues.push({ type: 'ollama_offline' })
    }
  }

  if (projectPath.trim()) {
    const nodeIssue = await checkProjectNodeDependencies(projectPath)
    if (nodeIssue) issues.push(nodeIssue)
  }

  return { ok: issues.length === 0, issues }
}
