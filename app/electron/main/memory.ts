import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { makeId } from '../../shared/makeId'
import { backupCorruptFile } from './fsUtil'
import type { MemoryCategory, MemoryEntry, MemoryScope, MemoryStore } from '../../src/types'
import { upsertEmbedding, removeEmbedding, semanticSearch } from './embeddings'

export const MEMORY_FILENAME = 'ViperMemory.md'
const LEGACY_MEMORY_FILENAME = 'memory.json'
const MEMORY_STORE_MARKER = '<!-- viper-memory-store'

const MAX_GLOBAL = 100
const MAX_PROJECT = 50
const MAX_INJECT = 15

function globalMemoryPath(): string {
  return join(app.getPath('userData'), MEMORY_FILENAME)
}

function legacyGlobalMemoryPath(): string {
  return join(app.getPath('userData'), LEGACY_MEMORY_FILENAME)
}

function projectDir(projectPath: string): string {
  return join(projectPath, '.codeviper')
}

function projectMemoryPath(projectPath: string): string {
  return join(projectDir(projectPath), MEMORY_FILENAME)
}

function legacyProjectMemoryPath(projectPath: string): string {
  return join(projectDir(projectPath), LEGACY_MEMORY_FILENAME)
}

function projectRulesPath(projectPath: string): string {
  return join(projectDir(projectPath), 'rules.md')
}

function emptyStore(): MemoryStore {
  return { version: 1, entries: [] }
}

export function parseMemoryMarkdown(raw: string): MemoryStore {
  const match = raw.match(/<!-- viper-memory-store\n([\s\S]*?)\n-->/)
  if (!match) return emptyStore()

  try {
    const parsed = JSON.parse(match[1]) as MemoryStore
    if (!Array.isArray(parsed.entries)) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

export function renderMemoryMarkdown(store: MemoryStore): string {
  const lines = [
    '# ViperMemory',
    '',
    'Долгосрочная память агента CodeViper. Записи добавляются через инструмент `remember`.',
    '',
    MEMORY_STORE_MARKER,
    JSON.stringify(store),
    '-->',
    '',
    '## Записи',
    ''
  ]

  if (!store.entries.length) {
    lines.push('_Пока пусто._')
  } else {
    for (const entry of store.entries) {
      const tags = entry.tags.length ? entry.tags.join(', ') : '—'
      lines.push(`### ${entry.id} · ${entry.category} · ${entry.scope}`)
      lines.push(
        `**Теги:** ${tags} · **Использовано:** ${entry.useCount} · **Обновлено:** ${entry.lastUsedAt}`
      )
      if (entry.source) lines.push(`**Источник:** ${entry.source}`)
      lines.push('')
      lines.push(entry.content)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function loadLegacyJson(path: string): Promise<MemoryStore | null> {
  if (!existsSync(path)) return null

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as MemoryStore
    if (!Array.isArray(parsed.entries)) return emptyStore()
    return parsed
  } catch {
    return null
  }
}

async function loadStore(mdPath: string, legacyPath: string): Promise<MemoryStore> {
  if (existsSync(mdPath)) {
    let raw: string
    try {
      raw = await readFile(mdPath, 'utf-8')
    } catch {
      return emptyStore()
    }

    const match = raw.match(/<!-- viper-memory-store\n([\s\S]*?)\n-->/)
    // Нет маркера — легитимно пустой/новый файл, не трогаем.
    if (!match) return emptyStore()

    try {
      const parsed = JSON.parse(match[1]) as MemoryStore
      if (!Array.isArray(parsed.entries)) throw new Error('bad shape')
      return parsed
    } catch {
      // Маркер есть, но JSON повреждён — спасаем файл, чтобы не затереть пустым.
      await backupCorruptFile(mdPath)
      return emptyStore()
    }
  }

  const legacy = await loadLegacyJson(legacyPath)
  if (legacy) {
    await saveStore(mdPath, legacy)
    return legacy
  }

  return emptyStore()
}

async function saveStore(filePath: string, store: MemoryStore): Promise<void> {
  const dir = join(filePath, '..')
  await mkdir(dir, { recursive: true })
  await writeFile(filePath, renderMemoryMarkdown(store), 'utf-8')
}

function trimStore(store: MemoryStore, max: number): MemoryStore {
  if (store.entries.length <= max) return store

  const sorted = [...store.entries].sort(
    (a, b) => b.useCount - a.useCount || b.lastUsedAt.localeCompare(a.lastUsedAt)
  )

  return { ...store, entries: sorted.slice(0, max) }
}

function normalizeTags(tags?: string[] | string): string[] {
  if (!tags) return []
  if (Array.isArray(tags)) return tags.map((t) => t.trim()).filter(Boolean)
  return tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

export async function readProjectRules(projectPath: string): Promise<string> {
  if (!projectPath) return ''
  const path = projectRulesPath(projectPath)
  if (!existsSync(path)) return ''

  try {
    return (await readFile(path, 'utf-8')).trim()
  } catch {
    return ''
  }
}

export async function listMemories(projectPath: string): Promise<MemoryEntry[]> {
  const global = await loadStore(globalMemoryPath(), legacyGlobalMemoryPath())
  const project = projectPath
    ? await loadStore(projectMemoryPath(projectPath), legacyProjectMemoryPath(projectPath))
    : emptyStore()

  return [...global.entries, ...project.entries].sort((a, b) => {
    const dateCmp = b.lastUsedAt.localeCompare(a.lastUsedAt)
    if (dateCmp !== 0) return dateCmp
    return b.createdAt.localeCompare(a.createdAt)
  })
}

export async function addMemory(
  projectPath: string,
  input: {
    content: string
    category: MemoryCategory
    tags?: string[] | string
    source?: string
    scope?: MemoryScope
  },
  ollamaUrl?: string
): Promise<MemoryEntry> {
  const content = input.content.trim()
  if (!content) throw new Error('Пустое знание')

  const scope: MemoryScope =
    input.scope ?? (input.category === 'project' && projectPath ? 'project' : 'global')
  const filePath =
    scope === 'project' && projectPath ? projectMemoryPath(projectPath) : globalMemoryPath()
  const legacyPath =
    scope === 'project' && projectPath
      ? legacyProjectMemoryPath(projectPath)
      : legacyGlobalMemoryPath()
  const max = scope === 'project' ? MAX_PROJECT : MAX_GLOBAL
  const store = await loadStore(filePath, legacyPath)
  const tags = normalizeTags(input.tags)
  const now = new Date().toISOString()

  const duplicate = store.entries.find(
    (entry) => entry.content.toLowerCase() === content.toLowerCase()
  )

  if (duplicate) {
    duplicate.useCount += 1
    duplicate.lastUsedAt = now
    if (input.source) duplicate.source = input.source
    await saveStore(filePath, store)
    return duplicate
  }

  const entry: MemoryEntry = {
    id: makeId(),
    content,
    category: input.category,
    tags,
    source: input.source,
    scope,
    createdAt: now,
    lastUsedAt: now,
    useCount: 1
  }

  store.entries.unshift(entry)
  await saveStore(filePath, trimStore(store, max))

  if (ollamaUrl) {
    void upsertEmbedding(entry.id, entry.content, scope, projectPath, ollamaUrl)
  }

  return entry
}

export async function deleteMemory(
  projectPath: string,
  id: string,
  scope?: MemoryScope
): Promise<boolean> {
  const targets =
    scope === 'project' && projectPath
      ? [{ md: projectMemoryPath(projectPath), legacy: legacyProjectMemoryPath(projectPath) }]
      : scope === 'global'
        ? [{ md: globalMemoryPath(), legacy: legacyGlobalMemoryPath() }]
        : [
            { md: globalMemoryPath(), legacy: legacyGlobalMemoryPath() },
            ...(projectPath
              ? [
                  {
                    md: projectMemoryPath(projectPath),
                    legacy: legacyProjectMemoryPath(projectPath)
                  }
                ]
              : [])
          ]

  for (const { md, legacy } of targets) {
    const store = await loadStore(md, legacy)
    const index = store.entries.findIndex((entry) => entry.id === id)
    if (index >= 0) {
      store.entries.splice(index, 1)
      await saveStore(md, store)
      void removeEmbedding(id, projectPath)
      return true
    }
  }

  return false
}

export async function searchMemories(
  projectPath: string,
  query: string,
  limit = 10,
  ollamaUrl?: string
): Promise<MemoryEntry[]> {
  const all = await listMemories(projectPath)
  const q = query.trim().toLowerCase()
  if (!q) return all.slice(0, limit)

  if (ollamaUrl) {
    const scored = await semanticSearch(query, projectPath, ollamaUrl, limit)
    if (scored && scored.length > 0) {
      const byId = new Map(all.map((e) => [e.id, e]))
      const semantic = scored.map((s) => byId.get(s.id)).filter(Boolean) as MemoryEntry[]
      if (semantic.length > 0) return semantic
    }
  }

  return all
    .filter((entry) => {
      const haystack = [entry.content, entry.category, ...entry.tags, entry.source ?? '']
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
    .slice(0, limit)
}

function scoreEntry(entry: MemoryEntry, query: string): number {
  const q = query.toLowerCase()
  let score = entry.useCount

  if (entry.content.toLowerCase().includes(q)) score += 5
  for (const tag of entry.tags) {
    if (tag.toLowerCase().includes(q)) score += 2
  }

  const ageDays = (Date.now() - Date.parse(entry.lastUsedAt)) / 86_400_000
  score -= Math.min(ageDays * 0.1, 3)
  return score
}

export async function buildMemoryContext(projectPath: string, taskHint = ''): Promise<string> {
  const all = await listMemories(projectPath)
  const rules = projectPath ? await readProjectRules(projectPath) : ''
  if (!all.length && !rules) return ''

  const ranked = [...all]
    .map((entry) => ({ entry, score: scoreEntry(entry, taskHint) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INJECT)
    .map(({ entry }) => entry)

  for (const entry of ranked) {
    entry.useCount += 1
    entry.lastUsedAt = new Date().toISOString()
  }

  if (ranked.length) {
    const globalStore = await loadStore(globalMemoryPath(), legacyGlobalMemoryPath())
    const projectStore = projectPath
      ? await loadStore(projectMemoryPath(projectPath), legacyProjectMemoryPath(projectPath))
      : emptyStore()

    for (const entry of ranked) {
      const store = entry.scope === 'project' ? projectStore : globalStore
      const target = store.entries.find((item) => item.id === entry.id)
      if (target) {
        target.useCount = entry.useCount
        target.lastUsedAt = entry.lastUsedAt
      }
    }

    await saveStore(globalMemoryPath(), globalStore)
    if (projectPath) await saveStore(projectMemoryPath(projectPath), projectStore)
  }

  const blocks: string[] = []

  if (rules) {
    blocks.push('## Правила проекта (.codeviper/rules.md)\n' + rules)
  }

  if (ranked.length) {
    blocks.push(
      `## ViperMemory.md — накопленные знания\n` +
        ranked
          .map(
            (entry, index) =>
              `${index + 1}. [${entry.category}] ${entry.content}${entry.tags.length ? ` (${entry.tags.join(', ')})` : ''}`
          )
          .join('\n')
    )
  }

  return blocks.join('\n\n')
}

export function parseReflectionLearnings(text: string): Array<{
  content: string
  category: MemoryCategory
  tags?: string[]
}> {
  const trimmed = text.trim()
  if (!trimmed) return []

  const jsonMatch = trimmed.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return []

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Array<{
      content?: string
      category?: string
      tags?: string[]
    }>

    const allowed: MemoryCategory[] = ['pattern', 'mistake', 'preference', 'project', 'skill']

    return parsed
      .filter((item) => item.content?.trim())
      .slice(0, 2)
      .map((item) => ({
        content: item.content!.trim(),
        category: allowed.includes(item.category as MemoryCategory)
          ? (item.category as MemoryCategory)
          : 'pattern',
        tags: item.tags
      }))
  } catch {
    return []
  }
}
