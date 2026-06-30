import { existsSync } from 'fs'
import { join } from 'path'
import { pathToFileURL } from 'url'
import type { SelfCommitResult } from './selfCommit'
import {
  commitAndPushSelfEdits as asarCommitAndPushSelfEdits,
  stageSelfEditsForRestart as asarStageSelfEditsForRestart
} from './selfCommit'
import { getBundledSourceAppRoot } from './bundledSourcePaths'
import { isBundledRuntimeFromClone } from './runtimeSourceState'

type SelfCommitFns = {
  commitAndPushSelfEdits: typeof asarCommitAndPushSelfEdits
  stageSelfEditsForRestart: typeof asarStageSelfEditsForRestart
}

let cachedCloneSelfCommit: SelfCommitFns | null = null

/** Только для unit-тестов. */
export function resetSelfCommitRuntimeCacheForTests(): void {
  cachedCloneSelfCommit = null
}

async function loadCloneSelfCommit(): Promise<SelfCommitFns | null> {
  if (!isBundledRuntimeFromClone()) return null
  if (cachedCloneSelfCommit) return cachedCloneSelfCommit

  const handlersPath = join(getBundledSourceAppRoot(), 'out', 'main', 'runtimeHandlers.js')
  if (!existsSync(handlersPath)) return null

  try {
    const mod = (await import(pathToFileURL(handlersPath).href)) as Partial<SelfCommitFns>
    if (typeof mod.commitAndPushSelfEdits !== 'function') return null
    cachedCloneSelfCommit = {
      commitAndPushSelfEdits: mod.commitAndPushSelfEdits,
      stageSelfEditsForRestart: mod.stageSelfEditsForRestart ?? asarStageSelfEditsForRestart
    }
    return cachedCloneSelfCommit
  } catch {
    return null
  }
}

/** Автокоммит: из git-клона при live runtime, иначе из asar. */
export async function commitAndPushSelfEditsRuntime(
  summary: string,
  configuredBranch?: string
): Promise<SelfCommitResult> {
  const clone = await loadCloneSelfCommit()
  return (clone?.commitAndPushSelfEdits ?? asarCommitAndPushSelfEdits)(summary, configuredBranch)
}

export async function stageSelfEditsForRestartRuntime(summary: string): Promise<SelfCommitResult> {
  const clone = await loadCloneSelfCommit()
  return (clone?.stageSelfEditsForRestart ?? asarStageSelfEditsForRestart)(summary)
}
