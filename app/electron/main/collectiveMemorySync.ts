import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import { spawn } from 'child_process'
import { Mutex } from 'async-mutex'
import {
  COLLECTIVE_MEMORY_REPO_PATH,
  COLLECTIVE_SKILLS_REPO_PATH,
  COLLECTIVE_MEMORY_SEMANTIC_DEDUP_THRESHOLD,
  COLLECTIVE_MEMORY_PUSH_RETRY_MAX,
  MIN_COLLECTIVE_ENTRY_LENGTH
} from '../../shared/constants'
import { resolveSelfImproveBranch } from '../../shared/selfImprovement'
import type { AgentSkill, MemoryEntry, MemoryStore, SkillsStore } from '../../src/types'
import { parseMemoryMarkdown, renderMemoryMarkdown } from './memory'
import { parseSkillsMarkdown } from './skills'
import { commitAndPushRepoPaths, createCodeViperPr, getRepoRoot } from './selfCommit'
import { loadScores, COLLECTIVE_SCORE_HIDE_THRESHOLD } from './collectiveScores'
import { getCodeViperSourceRoot } from './codeviperSource'
import { redactSecrets } from '../../shared/secretRedaction'
import { maxSemanticSimilarity } from './embeddingQueue'
import { loadSettings } from './settings'

function runGitCmd(
  cwd: string,
  args: string[]
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on('error', (error) => resolve({ code: 1, stdout: '', stderr: error.message }))
  })
}

async function isSemanticDuplicate(
  content: string,
  existingContents: string[],
  ollamaUrl: string
): Promise<boolean> {
  const normalized = content.trim().toLowerCase()
  if (existingContents.some((item) => item.trim().toLowerCase() === normalized)) return true
  if (!existingContents.length) return false

  const similarity = await maxSemanticSimilarity(content.trim(), existingContents, ollamaUrl)
  return similarity !== null && similarity > COLLECTIVE_MEMORY_SEMANTIC_DEDUP_THRESHOLD
}

/** Слияние записей в store с семантическим dedup (для merge и unit-тестов). */
export async function mergeEntriesWithSemanticDedup(
  store: MemoryStore,
  entries: MemoryEntry[],
  ollamaUrl: string
): Promise<{ store: MemoryStore; added: number }> {
  let added = 0
  const existingContents = store.entries.map((item) => item.content)

  for (const entry of entries) {
    const content = redactSecrets(entry.content)
    if (await isSemanticDuplicate(content, existingContents, ollamaUrl)) {
      const duplicate = store.entries.find(
        (item) => item.content.trim().toLowerCase() === content.trim().toLowerCase()
      )
      if (duplicate) {
        duplicate.useCount += 1
        duplicate.lastUsedAt = new Date().toISOString()
        continue
      }
      const semanticMatch = await findSemanticMatchEntry(store.entries, content, ollamaUrl)
      if (semanticMatch) {
        semanticMatch.useCount += 1
        semanticMatch.lastUsedAt = new Date().toISOString()
        continue
      }
      continue
    }

    store.entries.unshift({
      ...entry,
      scope: 'global',
      content,
      id: entry.id,
      createdAt: entry.createdAt,
      lastUsedAt: entry.lastUsedAt,
      useCount: entry.useCount
    })
    existingContents.unshift(content)
    added += 1
  }

  return { store, added }
}

async function findSemanticMatchEntry(
  entries: MemoryEntry[],
  content: string,
  ollamaUrl: string
): Promise<MemoryEntry | undefined> {
  for (const item of entries) {
    const similarity = await maxSemanticSimilarity(content.trim(), [item.content], ollamaUrl)
    if (similarity !== null && similarity > COLLECTIVE_MEMORY_SEMANTIC_DEDUP_THRESHOLD) {
      return item
    }
  }
  return undefined
}

const pendingEntries: MemoryEntry[] = []

/** Сериализует merge+push коллективной памяти — параллельные flush не затирают друг друга. */
const collectiveMemoryPushMutex = new Mutex()

export function isPushConflictMessage(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('non-fast-forward') ||
    lower.includes('rejected') ||
    lower.includes('failed to push') ||
    lower.includes('rebase') ||
    lower.includes('конфликт')
  )
}

export function queueCollectiveMemoryEntry(entry: MemoryEntry): boolean {
  if (entry.scope !== 'global') return false
  const duplicate = pendingEntries.some(
    (item) => item.content.toLowerCase() === entry.content.toLowerCase()
  )
  if (duplicate) return false
  pendingEntries.push({ ...entry, content: redactSecrets(entry.content) })
  return true
}

export function getPendingCollectiveMemoryCount(): number {
  return pendingEntries.length
}

function drainPendingEntries(): MemoryEntry[] {
  if (!pendingEntries.length) return []
  const drained = [...pendingEntries]
  pendingEntries.length = 0
  return drained
}

function emptyStore(): MemoryStore {
  return { version: 1, entries: [] }
}

export async function getCollectiveMemoryFilePath(): Promise<string | null> {
  const repoRoot = await getRepoRoot(getCodeViperSourceRoot())
  if (!repoRoot) return null
  return join(repoRoot, COLLECTIVE_MEMORY_REPO_PATH)
}

export async function readCollectiveMemoryStore(): Promise<MemoryStore> {
  const filePath = await getCollectiveMemoryFilePath()
  if (!filePath || !existsSync(filePath)) return emptyStore()

  try {
    const raw = await readFile(filePath, 'utf8')
    return parseMemoryMarkdown(raw)
  } catch {
    return emptyStore()
  }
}

export async function readCollectiveMemoryEntries(): Promise<MemoryEntry[]> {
  const store = await readCollectiveMemoryStore()
  return store.entries.map((entry) => ({
    ...entry,
    scope: 'global' as const,
    source: 'collective'
  }))
}

async function mergeIntoCollectiveFile(entries: MemoryEntry[]): Promise<number> {
  if (!entries.length) return 0

  const filePath = await getCollectiveMemoryFilePath()
  if (!filePath) return 0

  const store = existsSync(filePath)
    ? parseMemoryMarkdown(await readFile(filePath, 'utf8'))
    : emptyStore()

  const { ollamaUrl } = await loadSettings()
  const { store: merged, added } = await mergeEntriesWithSemanticDedup(store, entries, ollamaUrl)

  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, renderMemoryMarkdown(merged), 'utf8')
  return added
}

export interface CollectiveMemorySyncResult {
  ok: boolean
  message: string
  branch?: string
  syncedCount: number
  rejectedCount: number
  rejectionReasons?: string[]
}

export async function pullCollectiveMemoryFromRemote(
  configuredBranch?: string
): Promise<{ ok: boolean; message: string }> {
  const repoRoot = await getRepoRoot(getCodeViperSourceRoot())
  if (!repoRoot) return { ok: false, message: 'не git-репозиторий — pull пропущен' }

  const branch = resolveSelfImproveBranch(configuredBranch)

  const fetchResult = await runGitCmd(repoRoot, ['fetch', 'origin', branch])
  if (fetchResult.code !== 0) {
    return {
      ok: false,
      message: `git fetch не удался: ${(fetchResult.stderr || fetchResult.stdout).trim()}`
    }
  }

  const checkoutResult = await runGitCmd(repoRoot, [
    'checkout',
    `origin/${branch}`,
    '--',
    COLLECTIVE_MEMORY_REPO_PATH
  ])

  if (checkoutResult.code !== 0) {
    const stderr = (checkoutResult.stderr || checkoutResult.stdout).trim()
    if (/unknown revision|pathspec|did not match/i.test(stderr)) {
      return { ok: true, message: `ветка ${branch} ещё не создана на remote — pull пропущен` }
    }
    return { ok: false, message: `checkout remote файла не удался: ${stderr}` }
  }

  return { ok: true, message: `коллективная память обновлена из ветки ${branch}` }
}

export interface FilterResult {
  valid: MemoryEntry[]
  rejected: Array<{ reason: string }>
}

export async function filterEntriesBeforePush(entries: MemoryEntry[]): Promise<FilterResult> {
  const valid: MemoryEntry[] = []
  const rejected: Array<{ reason: string }> = []
  const remoteStore = await readCollectiveMemoryStore()
  const remoteContents = remoteStore.entries.map((e) => e.content)
  const acceptedContents = [...remoteContents]
  const scores = await loadScores()
  const { ollamaUrl } = await loadSettings()

  for (const entry of entries) {
    const score = scores[entry.id] ?? 0
    if (score <= COLLECTIVE_SCORE_HIDE_THRESHOLD) {
      rejected.push({
        reason: `низкий рейтинг (${score}): "${entry.content.substring(0, 30)}"`
      })
      continue
    }

    const trimmed = entry.content.trim()

    if (!trimmed) {
      rejected.push({ reason: `пусто: "${entry.content.substring(0, 30)}"` })
      continue
    }

    if (trimmed.length < MIN_COLLECTIVE_ENTRY_LENGTH) {
      rejected.push({
        reason: `коротко (${trimmed.length}/${MIN_COLLECTIVE_ENTRY_LENGTH}): "${trimmed.substring(0, 30)}"`
      })
      continue
    }

    if (acceptedContents.some((c) => c.trim().toLowerCase() === trimmed.toLowerCase())) {
      rejected.push({ reason: `дубль в remote: "${trimmed.substring(0, 30)}"` })
      continue
    }

    if (await isSemanticDuplicate(trimmed, acceptedContents, ollamaUrl)) {
      rejected.push({ reason: `семантический дубль: "${trimmed.substring(0, 30)}"` })
      continue
    }

    valid.push(entry)
    acceptedContents.push(trimmed)
  }

  return { valid, rejected }
}

export async function flushCollectiveMemoryToGit(
  summary: string,
  configuredBranch?: string,
  autoCollectivePr?: boolean
): Promise<CollectiveMemorySyncResult> {
  const entries = drainPendingEntries()
  if (!entries.length) {
    return {
      ok: true,
      message: 'нет новых знаний для синхронизации',
      syncedCount: 0,
      rejectedCount: 0
    }
  }

  const { valid, rejected } = await filterEntriesBeforePush(entries)

  if (!valid.length) {
    const reasons = rejected.map((r) => r.reason)
    return {
      ok: true,
      message: `все ${entries.length} записей отклонены`,
      syncedCount: 0,
      rejectedCount: rejected.length,
      rejectionReasons: reasons
    }
  }

  const reasons = rejected.map((r) => r.reason)

  return collectiveMemoryPushMutex.runExclusive(async () => {
    let added = 0
    let result: Awaited<ReturnType<typeof commitAndPushRepoPaths>> = {
      ok: false,
      message: 'push не выполнялся'
    }
    const branch = resolveSelfImproveBranch(configuredBranch)

    for (let attempt = 1; attempt <= COLLECTIVE_MEMORY_PUSH_RETRY_MAX; attempt++) {
      added = await mergeIntoCollectiveFile(valid)
      const commitSummary =
        added > 0 ? `${summary} (+${added} знаний)` : `${summary} (обновление существующих знаний)`

      result = await commitAndPushRepoPaths(
        commitSummary,
        [COLLECTIVE_MEMORY_REPO_PATH],
        configuredBranch
      )

      if (result.ok) break

      const canRetry =
        attempt < COLLECTIVE_MEMORY_PUSH_RETRY_MAX && isPushConflictMessage(result.message)
      if (!canRetry) break

      await pullCollectiveMemoryFromRemote(configuredBranch)
    }

    let prMessage: string | undefined
    if (result.ok && autoCollectivePr) {
      const commitSummary =
        added > 0 ? `${summary} (+${added} знаний)` : `${summary} (обновление существующих знаний)`
      const prTitle = `Коллективные знания: ${commitSummary}`
      const pr = await createCodeViperPr(prTitle)
      prMessage = pr.message
    }

    return {
      ok: result.ok,
      message: prMessage ? `${result.message} | PR: ${prMessage}` : result.message,
      branch: result.branch ?? branch,
      syncedCount: added > 0 ? added : valid.length,
      rejectedCount: rejected.length,
      rejectionReasons: reasons.length > 0 ? reasons : undefined
    }
  })
}

// ── Коллективные навыки ─────────────────────────────────────────────────────

async function getCollectiveSkillsFilePath(): Promise<string | null> {
  const repoRoot = await getRepoRoot(getCodeViperSourceRoot())
  if (!repoRoot) return null
  return join(repoRoot, COLLECTIVE_SKILLS_REPO_PATH)
}

function emptySkillsStore(): SkillsStore {
  return { version: 1, skills: [] }
}

export async function readCollectiveSkillsStore(): Promise<SkillsStore> {
  const filePath = await getCollectiveSkillsFilePath()
  if (!filePath || !existsSync(filePath)) return emptySkillsStore()

  try {
    const raw = await readFile(filePath, 'utf8')
    return parseSkillsMarkdown(raw)
  } catch {
    return emptySkillsStore()
  }
}

export async function readCollectiveSkills(): Promise<AgentSkill[]> {
  const store = await readCollectiveSkillsStore()
  return store.skills.map((skill) => ({
    ...skill,
    scope: 'global' as const,
    source: 'collective'
  }))
}

export async function pullCollectiveSkillsFromRemote(
  configuredBranch?: string
): Promise<{ ok: boolean; message: string }> {
  const repoRoot = await getRepoRoot(getCodeViperSourceRoot())
  if (!repoRoot) return { ok: false, message: 'не git-репозиторий — pull пропущен' }

  const branch = resolveSelfImproveBranch(configuredBranch)

  const fetchResult = await runGitCmd(repoRoot, ['fetch', 'origin', branch])
  if (fetchResult.code !== 0) {
    return {
      ok: false,
      message: `git fetch не удался: ${(fetchResult.stderr || fetchResult.stdout).trim()}`
    }
  }

  const checkoutResult = await runGitCmd(repoRoot, [
    'checkout',
    `origin/${branch}`,
    '--',
    COLLECTIVE_SKILLS_REPO_PATH
  ])

  if (checkoutResult.code !== 0) {
    const stderr = (checkoutResult.stderr || checkoutResult.stdout).trim()
    if (/unknown revision|pathspec|did not match/i.test(stderr)) {
      return { ok: true, message: `ветка ${branch} ещё не создана на remote — pull пропущен` }
    }
    return { ok: false, message: `checkout remote файла не удался: ${stderr}` }
  }

  return { ok: true, message: `коллективные навыки обновлены из ветки ${branch}` }
}
