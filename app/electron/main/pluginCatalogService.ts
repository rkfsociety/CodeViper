import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, readdir, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import {
  PLUGIN_CATALOG,
  catalogSkillIdPrefix,
  findCatalogEntry,
  type PluginCatalogEntry
} from '../../shared/pluginCatalog'
import { cliSpawnBase } from './windowsGitEnv'
import { deleteSkill, importSkillsFromDirectory, listSkills } from './skills'

const GIT_TIMEOUT_MS = 120_000
const STATE_FILENAME = 'plugin-catalog-state.json'

export interface PluginCatalogInstallRecord {
  catalogId: string
  installedAt: string
  updatedAt: string
  skillIds: string[]
  skillsImported: number
  commit?: string
}

export interface PluginCatalogState {
  version: 1
  installed: Record<string, PluginCatalogInstallRecord>
}

export interface PluginCatalogItemView {
  entry: PluginCatalogEntry
  installed: boolean
  installedAt?: string
  updatedAt?: string
  skillsImported?: number
  skillCount?: number
}

export interface PluginCatalogActionResult {
  ok: boolean
  message: string
  imported?: number
  skipped?: number
  warnings?: string[]
}

interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

function catalogCacheRoot(): string {
  return join(app.getPath('userData'), 'plugin-catalog')
}

function catalogRepoPath(catalogId: string): string {
  return join(catalogCacheRoot(), catalogId)
}

function statePath(): string {
  return join(catalogCacheRoot(), STATE_FILENAME)
}

async function runGit(cwd: string, args: string[]): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, GIT_TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

async function isDirectoryEmpty(dir: string): Promise<boolean> {
  try {
    const entries = await readdir(dir)
    return entries.length === 0
  } catch {
    return true
  }
}

async function readHeadCommit(repoPath: string): Promise<string | undefined> {
  const result = await runGit(repoPath, ['rev-parse', '--short', 'HEAD'])
  if (result.code !== 0) return undefined
  return result.stdout.trim() || undefined
}

async function loadState(): Promise<PluginCatalogState> {
  const path = statePath()
  if (!existsSync(path)) {
    return { version: 1, installed: {} }
  }

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as PluginCatalogState
    if (parsed.version !== 1 || typeof parsed.installed !== 'object' || !parsed.installed) {
      return { version: 1, installed: {} }
    }
    return parsed
  } catch {
    return { version: 1, installed: {} }
  }
}

async function saveState(state: PluginCatalogState): Promise<void> {
  await mkdir(catalogCacheRoot(), { recursive: true })
  await writeFile(statePath(), JSON.stringify(state, null, 2), 'utf-8')
}

async function ensureGitAvailable(): Promise<string | null> {
  const result = await runGit(process.cwd(), ['--version'])
  if (result.code !== 0) {
    return 'Git не найден в PATH. Установите Git for Windows и перезапустите CodeViper.'
  }
  return null
}

async function ensureRepoClone(
  entry: PluginCatalogEntry
): Promise<{ ok: true; path: string } | { ok: false; message: string }> {
  const repoPath = catalogRepoPath(entry.id)
  const branch = entry.branch ?? 'main'

  if (existsSync(join(repoPath, '.git'))) {
    const pull = await runGit(repoPath, ['pull', '--ff-only', 'origin', branch])
    if (pull.code !== 0) {
      const fetch = await runGit(repoPath, ['fetch', 'origin', branch])
      if (fetch.code === 0) {
        const reset = await runGit(repoPath, ['reset', '--hard', `origin/${branch}`])
        if (reset.code !== 0) {
          return {
            ok: false,
            message: (pull.stderr || pull.stdout || 'git pull failed').trim()
          }
        }
      } else {
        return {
          ok: false,
          message: (pull.stderr || pull.stdout || 'git pull failed').trim()
        }
      }
    }
    return { ok: true, path: repoPath }
  }

  await mkdir(catalogCacheRoot(), { recursive: true })
  if (existsSync(repoPath) && !(await isDirectoryEmpty(repoPath))) {
    return { ok: false, message: `Папка кэша занята: ${repoPath}` }
  }

  const parent = dirname(repoPath)
  await mkdir(parent, { recursive: true })
  const clone = await runGit(parent, [
    'clone',
    '--depth',
    '1',
    '--branch',
    branch,
    entry.repoUrl,
    entry.id
  ])

  if (clone.code !== 0 || !existsSync(join(repoPath, '.git'))) {
    return {
      ok: false,
      message: (clone.stderr || clone.stdout || 'git clone failed').trim()
    }
  }

  return { ok: true, path: repoPath }
}

async function removeCatalogSkills(
  projectPath: string,
  catalogId: string,
  skillIds?: string[]
): Promise<void> {
  const prefix = catalogSkillIdPrefix(catalogId)
  const ids =
    skillIds ??
    (await listSkills(projectPath))
      .filter((skill) => skill.id.startsWith(prefix))
      .map((skill) => skill.id)

  for (const id of ids) {
    try {
      await deleteSkill(projectPath, id)
    } catch {
      /* skill мог быть удалён вручную */
    }
  }
}

export async function listPluginCatalog(): Promise<PluginCatalogItemView[]> {
  const state = await loadState()
  return PLUGIN_CATALOG.map((entry) => {
    const record = state.installed[entry.id]
    return {
      entry,
      installed: Boolean(record),
      installedAt: record?.installedAt,
      updatedAt: record?.updatedAt,
      skillsImported: record?.skillsImported,
      skillCount: record?.skillIds.length
    }
  })
}

export async function installPluginCatalogEntry(
  catalogId: string,
  projectPath = ''
): Promise<PluginCatalogActionResult> {
  const entry = findCatalogEntry(catalogId)
  if (!entry) {
    return { ok: false, message: `Плагин «${catalogId}» не найден в каталоге` }
  }
  if (entry.kind !== 'skills-repo') {
    return { ok: false, message: `Тип плагина «${entry.kind}» пока не поддерживается` }
  }

  const gitError = await ensureGitAvailable()
  if (gitError) return { ok: false, message: gitError }

  const clone = await ensureRepoClone(entry)
  if (!clone.ok) return { ok: false, message: clone.message }

  const state = await loadState()
  const existing = state.installed[catalogId]
  await removeCatalogSkills(projectPath, catalogId, existing?.skillIds)

  const importResult = await importSkillsFromDirectory(projectPath, clone.path, {
    skillIdPrefix: catalogSkillIdPrefix(catalogId)
  })

  if (importResult.imported === 0) {
    return {
      ok: false,
      message:
        importResult.warnings[0] ??
        'Не удалось импортировать skills (проверьте папку skills/ в репозитории)',
      skipped: importResult.skipped,
      warnings: importResult.warnings
    }
  }

  const now = new Date().toISOString()
  const commit = await readHeadCommit(clone.path)
  state.installed[catalogId] = {
    catalogId,
    installedAt: existing?.installedAt ?? now,
    updatedAt: now,
    skillIds: importResult.skillIds,
    skillsImported: importResult.imported,
    commit
  }
  await saveState(state)

  const suffix = importResult.skipped > 0 ? `, пропущено ${importResult.skipped}` : ''
  return {
    ok: true,
    message: `Установлено: ${importResult.imported} skills${suffix}`,
    imported: importResult.imported,
    skipped: importResult.skipped,
    warnings: importResult.warnings
  }
}

export async function updatePluginCatalogEntry(
  catalogId: string,
  projectPath = ''
): Promise<PluginCatalogActionResult> {
  return installPluginCatalogEntry(catalogId, projectPath)
}

export async function uninstallPluginCatalogEntry(
  catalogId: string,
  projectPath = ''
): Promise<PluginCatalogActionResult> {
  const entry = findCatalogEntry(catalogId)
  if (!entry) {
    return { ok: false, message: `Плагин «${catalogId}» не найден в каталоге` }
  }

  const state = await loadState()
  const record = state.installed[catalogId]
  await removeCatalogSkills(projectPath, catalogId, record?.skillIds)
  delete state.installed[catalogId]
  await saveState(state)

  return { ok: true, message: 'Плагин удалён (навыки сняты с агента)' }
}
