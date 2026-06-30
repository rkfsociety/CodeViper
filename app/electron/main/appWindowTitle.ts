import { app, type BrowserWindow } from 'electron'
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'
import { getBundledSourceRoot } from './bundledSourcePaths'
import { isBundledRuntimeFromClone } from './runtimeSourceState'
import {
  RUNTIME_BUILD_HEAD_LEGACY_REL,
  RUNTIME_BUILD_HEAD_REL,
  BUNDLED_SOURCE_APP_DIR_NAME
} from '../../shared/constants'

declare const __BUILD_COMMIT__: string | undefined

let mainWindowForTitle: BrowserWindow | null = null

export function registerMainWindowForTitle(win: BrowserWindow | null): void {
  mainWindowForTitle = win
}

export function refreshAppWindowTitle(): void {
  if (mainWindowForTitle && !mainWindowForTitle.isDestroyed()) {
    mainWindowForTitle.setTitle(getAppWindowTitle())
  }
}

function shortCommitHash(hash: string): string {
  const trimmed = hash.trim()
  if (!trimmed) return ''
  return trimmed.length > 7 ? trimmed.slice(0, 7) : trimmed
}

function readGitHeadShort(repoRoot: string): string | null {
  try {
    const headPath = join(repoRoot, '.git', 'HEAD')
    if (!existsSync(headPath)) return null

    const head = readFileSync(headPath, 'utf8').trim()
    if (head.startsWith('ref: ')) {
      const refPath = join(repoRoot, '.git', head.slice(5).trim())
      if (!existsSync(refPath)) return null
      const hash = readFileSync(refPath, 'utf8').trim()
      return hash ? shortCommitHash(hash) : null
    }

    return head ? shortCommitHash(head) : null
  } catch {
    return null
  }
}

function readGitHeadShortFromCandidates(roots: string[]): string | null {
  for (const root of roots) {
    const hash = readGitHeadShort(root)
    if (hash) return hash
  }
  return null
}

function getRuntimeBuildHeadFromClone(): string | null {
  const appRoot = join(getBundledSourceRoot(), BUNDLED_SOURCE_APP_DIR_NAME)
  for (const rel of [RUNTIME_BUILD_HEAD_REL, RUNTIME_BUILD_HEAD_LEGACY_REL]) {
    const headPath = join(appRoot, rel)
    if (!existsSync(headPath)) continue
    try {
      const head = readFileSync(headPath, 'utf8').trim()
      if (head) return head
    } catch {
      /* ignore */
    }
  }
  return null
}

/** Короткий hash коммита runtime (клон, dev-репозиторий или маркер сборки оболочки). */
export function getAppCommitShort(): string | null {
  if (isBundledRuntimeFromClone()) {
    const buildHead = getRuntimeBuildHeadFromClone()
    if (buildHead) return shortCommitHash(buildHead)

    const fromClone = readGitHeadShort(getBundledSourceRoot())
    if (fromClone) return fromClone
  }

  const sourceRoot = getCodeViperSourceRoot()
  const fromDev = readGitHeadShortFromCandidates([dirname(sourceRoot), sourceRoot])
  if (fromDev) return fromDev

  const buildCommit = typeof __BUILD_COMMIT__ === 'string' ? __BUILD_COMMIT__.trim() : ''
  return buildCommit ? shortCommitHash(buildCommit) : null
}

export function getAppWindowTitle(): string {
  const version = app.getVersion()
  const commit = getAppCommitShort()
  return commit ? `CodeViper ${version} ${commit}` : `CodeViper ${version}`
}
