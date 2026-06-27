/**
 * Классификация изменений: нужен ли NSIS-релиз оболочки vs достаточно live runtime (блок 0).
 *
 * Логика: если все изменённые файлы — runtime/docs/артефакты → релиз не нужен.
 * Любой файл оболочки (renderer, preload, IPC bootstrap, installer) → релиз нужен.
 */

/** Не учитывать при решении о релизе */
export const IGNORE_PREFIXES = [
  'app/out/',
  'docs/',
  '.codeviper/',
  '.cursor/',
  '.github/',
  'server/',
  'scripts/fix-roadmap',
  'scripts/insert-roadmap',
  'scripts/shell-release-paths',
  'scripts/shell-release-paths.test',
]

export const IGNORE_EXACT = new Set([
  'ROADMAP.md',
  'CHANGELOG.md',
  'README.md',
  'AGENTS.md',
  'CLAUDE.md',
  'CONTRIBUTING.md',
  '.github/workflows/docs.yml',
])

/** Всегда требуют новый установщик */
export const SHELL_ALWAYS_PREFIXES = [
  'app/src/',
  'app/electron/preload/',
  'resources/',
  'scripts/download-node.js',
]

export const SHELL_ALWAYS_EXACT = new Set(['CodeViper.cmd', 'CodeViper.sh'])

/** Обновляются через git pull + build в клоне (runtimeHandlers и агент) */
export const RUNTIME_ONLY_PREFIXES = [
  'app/electron/main/agentHandlers',
  'app/electron/main/agentTools/',
  'app/electron/main/providers/',
  'app/tests/',
  'app/shared/',
]

export const RUNTIME_ONLY_EXACT = new Set([
  'app/electron/main/agent.ts',
  'app/electron/main/agentContext.ts',
  'app/electron/main/agentContextManager.ts',
  'app/electron/main/agentLoopGuard.ts',
  'app/electron/main/agentToolExecutor.ts',
  'app/electron/main/agentTrace.ts',
  'app/electron/main/agentOllamaApi.ts',
  'app/electron/main/agentPrerequisites.ts',
  'app/electron/main/agentSelfImprovementOrchestrator.ts',
  'app/electron/main/agentLogger.ts',
  'app/electron/main/contextSummarizer.ts',
  'app/electron/main/selfCommit.ts',
  'app/electron/main/mcpTools.ts',
  'app/electron/main/runtimeHandlers.ts',
  'app/electron/main/modelRuntime.ts',
  'app/electron/main/services.ts',
  'app/electron/main/gitTools.ts',
  'app/electron/main/githubTools.ts',
  'app/electron/main/gitlabTools.ts',
  'app/electron/main/defaultSkills.ts',
  'app/electron/main/skills.ts',
  'app/electron/main/memory.ts',
  'app/electron/main/taskPlanner.ts',
  'app/electron/main/subagentRunner.ts',
  'app/electron/main/orchestratorModel.ts',
  'app/electron/main/roadmapParser.ts',
  'app/electron/main/selfImprovementStore.ts',
  'app/electron/main/commandRunner.ts',
  'app/electron/main/scriptSandbox.ts',
  'app/electron/main/fileSearch.ts',
  'app/electron/main/fileSearchInWorker.ts',
  'app/electron/main/embeddingQueue.ts',
  'app/electron/main/embeddingWorker.ts',
  'app/electron/main/largeFileQueue.ts',
  'app/electron/main/largeFileWorker.ts',
  'app/electron/main/embeddings.ts',
  'app/electron/main/vectorStore.ts',
  'app/electron/main/contextRAG.ts',
  'app/electron/main/nodeLlama.ts',
  'app/electron/main/ollamaRuntime.ts',
  'app/electron/main/ollamaModels.ts',
  'app/electron/main/modelSelection.ts',
  'app/electron/main/modelBenchmark.ts',
  'app/electron/main/mcpRegistry.ts',
  'app/electron/main/p2pClient.ts',
  'app/electron/main/collectiveScores.ts',
  'app/electron/main/githubPr.ts',
  'app/electron/main/githubAuth.ts',
  'app/electron/main/gist.ts',
  'app/electron/main/webhookNotify.ts',
  'app/electron/main/runCheckpoint.ts',
  'app/electron/main/fileHistory.ts',
  'app/electron/main/diffUtil.ts',
  'app/electron/main/fsUtil.ts',
  'app/electron/main/ignorePatterns.ts',
  'app/electron/main/progress.ts',
  'app/electron/main/ndjson.ts',
  'app/electron/main/pluginLoader.ts',
  'app/electron/main/pluginWorker.ts',
  'app/electron/main/systemStats.ts',
])

/** Bootstrap оболочки — только в asar, не подменяется runtimeHandlers */
export const SHELL_MAIN_EXACT = new Set([
  'app/electron/main/index.ts',
  'app/electron/main/updateChecker.ts',
  'app/electron/main/bundledSourceSync.ts',
  'app/electron/main/bundledSourceBuild.ts',
  'app/electron/main/runtimeBootstrap.ts',
  'app/electron/main/runtimeUpdate.ts',
  'app/electron/main/windowsGitEnv.ts',
  'app/electron/main/codeviperSource.ts',
  'app/electron/main/settings.ts',
  'app/electron/main/appShutdown.ts',
  'app/electron/main/appState.ts',
  'app/electron/main/appIcon.ts',
  'app/electron/main/tray.ts',
  'app/package.json',
  'app/package-lock.json',
  'app/electron.vite.config.ts',
  'app/tsconfig.json',
  'app/tsconfig.node.json',
  'app/tsconfig.web.json',
  'app/vitest.config.ts',
  'app/playwright.config.ts',
  'app/index.html',
])

const SHELL_MAIN_PREFIXES = ['app/electron/main/ipc/']

function normalizePath(p) {
  return p.replace(/\\/g, '/')
}

export function shouldIgnorePath(filePath) {
  const p = normalizePath(filePath)
  if (IGNORE_EXACT.has(p)) return true
  return IGNORE_PREFIXES.some((prefix) => p.startsWith(prefix) || p === prefix.replace(/\/$/, ''))
}

export function isRuntimeOnlyPath(filePath) {
  const p = normalizePath(filePath)
  if (RUNTIME_ONLY_EXACT.has(p)) return true
  return RUNTIME_ONLY_PREFIXES.some((prefix) => p.startsWith(prefix))
}

export function isShellPath(filePath) {
  const p = normalizePath(filePath)
  if (shouldIgnorePath(p)) return false
  if (SHELL_ALWAYS_EXACT.has(p)) return true
  if (SHELL_ALWAYS_PREFIXES.some((prefix) => p.startsWith(prefix))) return true
  if (SHELL_MAIN_EXACT.has(p)) return true
  if (SHELL_MAIN_PREFIXES.some((prefix) => p.startsWith(prefix))) return true
  if (isRuntimeOnlyPath(p)) return false
  // Неизвестные пути в app/ — осторожно считаем оболочкой
  if (p.startsWith('app/')) return true
  return false
}

/**
 * @param {string[]} changedFiles
 * @returns {{ needed: boolean, shellFiles: string[], ignoredFiles: string[], runtimeFiles: string[] }}
 */
export function classifyChangedFiles(changedFiles) {
  const shellFiles = []
  const ignoredFiles = []
  const runtimeFiles = []

  for (const raw of changedFiles) {
    const p = normalizePath(raw.trim())
    if (!p) continue
    if (shouldIgnorePath(p)) {
      ignoredFiles.push(p)
      continue
    }
    if (isShellPath(p)) shellFiles.push(p)
    else runtimeFiles.push(p)
  }

  return {
    needed: shellFiles.length > 0,
    shellFiles,
    ignoredFiles,
    runtimeFiles
  }
}
