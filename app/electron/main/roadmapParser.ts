import { appendFile, readFile, readdir } from 'fs/promises'
import { existsSync } from 'fs'
import { basename, join, resolve } from 'path'
import { extractRoadmapTitleFromTask } from '../../shared/selfImprovement'
import { getBundledSourceRoot } from './bundledSourcePaths'
import { getCodeViperSourceRoot } from './codeviperSource'

export interface RoadmapItem {
  num: number
  size: 'S' | 'M' | 'L' | 'XL'
  title: string
  priority: string
  chain: string
}

export interface RoadmapItemDetail extends RoadmapItem {
  goal: string
  files: string
  action: string
  verification: string
}

export interface PrioritizedRoadmapItem extends RoadmapItem {
  score: number
  reasons: string[]
}

const ROADMAP_ITEM_HEADER_RE = /^\*\*(\d+)\s*·\s*(S|M|L|XL)\s*·\s*(.+?)\*\*/u

function normalizeRoadmapLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function toRoadmapItemDetail(raw: Partial<RoadmapItemDetail>): RoadmapItemDetail {
  return {
    num: raw.num!,
    size: raw.size!,
    title: raw.title!,
    priority: raw.priority!,
    chain: raw.chain!,
    goal: raw.goal ?? '',
    files: raw.files ?? '',
    action: raw.action ?? '',
    verification: raw.verification ?? ''
  }
}

export function resolveRoadmapPath(): string | null {
  const candidates = [join(getCodeViperSourceRoot(), '..', 'ROADMAP.md')]
  try {
    candidates.push(join(getBundledSourceRoot(), 'ROADMAP.md'))
  } catch {
    /* ignore */
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (seen.has(path)) continue
    seen.add(path)
    if (existsSync(path)) return path
  }
  return null
}

export function resolveRoadmapDirectory(): string | null {
  const candidates = [join(getCodeViperSourceRoot(), '..', 'ROADMAP')]
  try {
    candidates.push(join(getBundledSourceRoot(), 'ROADMAP'))
  } catch {
    /* ignore */
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (seen.has(path)) continue
    seen.add(path)
    if (existsSync(path)) return path
  }
  return null
}

export function resolveRoadmapDonePath(): string | null {
  const candidates = [join(getCodeViperSourceRoot(), '..', 'ROADMAP_DONE.md')]
  try {
    candidates.push(join(getBundledSourceRoot(), 'ROADMAP_DONE.md'))
  } catch {
    /* ignore */
  }

  const seen = new Set<string>()
  for (const candidate of candidates) {
    const path = resolve(candidate)
    if (seen.has(path)) continue
    seen.add(path)
    if (existsSync(path)) return path
  }
  return null
}

async function resolveRoadmapFiles(): Promise<string[]> {
  const dir = resolveRoadmapDirectory()
  if (!dir) {
    const single = resolveRoadmapPath()
    return single ? [single] : []
  }
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.md'))
    .map((entry) => join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function findRoadmapDoneMatch(searchText: string): Promise<string | null> {
  const donePath = resolveRoadmapDonePath()
  if (!donePath) return null

  const content = await readFile(donePath, 'utf-8')
  const title = extractRoadmapTitleFromTask(searchText)
  const probe = (title ?? searchText.trim().split('\n')[0] ?? '').toLowerCase()
  const keywords = probe
    .split(/[\s—·\-–,;:]+/u)
    .map((w) => w.trim())
    .filter((w) => w.length >= 4)

  if (keywords.length === 0) return null

  let bestLine: string | null = null
  let bestScore = 0

  for (const line of normalizeRoadmapLines(content)) {
    const trimmed = line.trim()
    if (!trimmed.startsWith('-')) continue
    const lower = trimmed.toLowerCase()
    const score = keywords.filter((k) => lower.includes(k)).length
    if (score > bestScore && score >= Math.min(2, keywords.length)) {
      bestScore = score
      bestLine = trimmed
    }
  }

  return bestLine
}

function isSplitRoadmapLayout(): boolean {
  return resolveRoadmapDirectory() !== null
}

function parseRoadmapItems(content: string, options?: { splitFormat?: boolean }): RoadmapItem[] {
  const splitFormat = options?.splitFormat ?? false
  const lines = normalizeRoadmapLines(content)
  const items: RoadmapItem[] = []
  let inPlans = splitFormat
  let currentChain = 'Независимые'

  for (const line of lines) {
    if (!splitFormat && line.startsWith('## ')) {
      inPlans = true
      continue
    }
    if (!splitFormat && inPlans && line.startsWith('## ') && !line.startsWith('###')) {
      break
    }
    if (!inPlans) continue

    const chainMatch = line.match(/^###\s+.+?\s+(.+)/u)
    if (chainMatch) {
      currentChain = chainMatch[1].trim()
      continue
    }

    const itemMatch = line.match(ROADMAP_ITEM_HEADER_RE)
    if (!itemMatch) continue

    items.push({
      num: Number.parseInt(itemMatch[1], 10),
      size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
      title: itemMatch[3].trim(),
      priority: 'Low',
      chain: currentChain
    })
  }

  return items
}

function scoreRoadmapItem(item: RoadmapItem): PrioritizedRoadmapItem {
  let score = 0
  const reasons: string[] = []
  const lowerChain = item.chain.toLowerCase()
  const lowerTitle = item.title.toLowerCase()

  if (lowerChain.includes('критично')) {
    score += 50
    reasons.push('критичный раздел')
  } else if (lowerChain.includes('важно')) {
    score += 35
    reasons.push('важный раздел')
  } else if (lowerChain.includes('полезно')) {
    score += 20
    reasons.push('полезный раздел')
  } else if (lowerChain.includes('можно')) {
    score += 10
    reasons.push('неблокирующий раздел')
  }

  if (item.size === 'S') {
    score += 12
    reasons.push('быстрая задача S')
  } else if (item.size === 'M') {
    score += 8
    reasons.push('умеренная задача M')
  } else if (item.size === 'L') {
    score += 4
    reasons.push('крупная задача L')
  }

  const levelMatch = lowerTitle.match(/уровень\s*(\d+)/u)
  if (levelMatch) {
    const level = Number.parseInt(levelMatch[1] ?? '', 10)
    if (Number.isFinite(level)) {
      score += Math.max(0, 5 - level) * 3
      reasons.push(`уровень ${level}`)
    }
  }

  if (
    /ci|build|release|security|cve|crash|stability|стабил|безопас|релиз|сборк|roadmap/i.test(
      lowerTitle
    )
  ) {
    score += 18
    reasons.push('влияет на базовую надёжность')
  }

  if (/accessibility|aria|screen reader|a11y|ux|readme/i.test(lowerTitle)) {
    score += 6
    reasons.push('быстрый заметный эффект')
  }

  return { ...item, score, reasons }
}

export async function listRoadmapItems(): Promise<RoadmapItem[]> {
  const files = await resolveRoadmapFiles()
  if (files.length === 0) return []
  const splitFormat = isSplitRoadmapLayout()
  const contents = await Promise.all(files.map((path) => readFile(path, 'utf-8')))
  return contents.flatMap((content) => parseRoadmapItems(content, { splitFormat }))
}

export async function prioritizeRoadmapItems(limit = 10): Promise<PrioritizedRoadmapItem[]> {
  const items = await listRoadmapItems()
  return items
    .map(scoreRoadmapItem)
    .sort((a, b) => b.score - a.score || a.num - b.num)
    .slice(0, Math.max(1, limit))
}

export function formatRoadmapItemsList(items: RoadmapItem[]): string {
  if (items.length === 0) {
    return 'ROADMAP.md не найден или в разделе «В планах» нет пунктов.'
  }
  const lines = items.map((it) => `${it.num} · ${it.title} · ${it.chain}`)
  return `Пункты ROADMAP «В планах» (${items.length}):\n\n${lines.join('\n')}`
}

export function formatPrioritizedRoadmapItemsList(items: PrioritizedRoadmapItem[]): string {
  if (items.length === 0) {
    return 'ROADMAP.md не найден или в разделе «В планах» нет пунктов.'
  }

  const lines = items.map(
    (it, index) =>
      `${index + 1}. #${it.num} · ${it.title} · score ${it.score} · ${it.chain}${it.reasons.length ? ` · ${it.reasons.join(', ')}` : ''}`
  )

  return `Приоритет ROADMAP (${items.length}):\n\n${lines.join('\n')}`
}

export async function readRoadmapItem(num: number): Promise<RoadmapItemDetail | null> {
  const files = await resolveRoadmapFiles()
  const splitFormat = isSplitRoadmapLayout()
  for (const roadmapPath of files) {
    const content = await readFile(roadmapPath, 'utf-8')
    const lines = normalizeRoadmapLines(content)

    let inPlans = splitFormat
    let currentChain = 'Независимые'
    let current: Partial<RoadmapItemDetail> | null = null

    const finishIfMatch = (): RoadmapItemDetail | null => {
      if (current?.num === num) return toRoadmapItemDetail(current)
      return null
    }

    for (const line of lines) {
      if (!splitFormat && line.startsWith('## ')) {
        inPlans = true
        continue
      }
      if (!splitFormat && inPlans && line.startsWith('## ') && !line.startsWith('###')) {
        break
      }
      if (!inPlans) continue

      const chainMatch = line.match(/^###\s+.+?\s+(.+)/u)
      if (chainMatch) {
        currentChain = chainMatch[1].trim()
        continue
      }

      const itemMatch = line.match(ROADMAP_ITEM_HEADER_RE)
      if (itemMatch) {
        const found = finishIfMatch()
        if (found) return found

        current = {
          num: Number.parseInt(itemMatch[1], 10),
          size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
          title: itemMatch[3].trim(),
          priority: 'Low',
          chain: currentChain
        }
        continue
      }

      if (current && line.startsWith('- **')) {
        const value = line.replace(/^-\s+\*\*.*?:\*\*\s*/u, '').trim()
        if (!current.goal) current.goal = value
        else if (!current.files) current.files = value
        else if (!current.action) current.action = value
        else if (!current.verification) current.verification = value
      }
    }

    const found = finishIfMatch()
    if (found) return found
  }

  return null
}

export function formatRoadmapDoneEntry(item: RoadmapItemDetail): string {
  const summary = (item.goal || item.action || item.verification).trim()
  return summary ? `- ${item.title}: ${summary}` : `- ${item.title}`
}

export async function appendRoadmapDoneItem(item: RoadmapItemDetail): Promise<void> {
  const donePath = resolveRoadmapDonePath()
  if (!donePath) {
    throw new Error('ROADMAP_DONE.md не найден')
  }
  const entry = formatRoadmapDoneEntry(item)
  const existing = await readFile(donePath, 'utf-8')
  if (
    existing.includes(entry) ||
    new RegExp(`^- ${escapeRegExp(item.title)}:`, 'm').test(existing)
  ) {
    return
  }
  const prefix = existing.trimEnd()
  const separator = prefix.length > 0 ? '\n' : ''
  await appendFile(donePath, `${separator}${entry}\n`, 'utf-8')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ROADMAP_PATH_ALIASES: Record<string, string[]> = {
  'openaiprovider.ts': ['electron/main/providers/openaiProvider.ts'],
  'modelruntime.ts': ['electron/main/modelRuntime.ts'],
  'modeltab/providers': ['src/components/SettingsModal/ModelTab.tsx'],
  'modeltab/providers/': ['src/components/SettingsModal/ModelTab.tsx']
}

const ROADMAP_SEARCH_DIRS = [
  'electron/main/providers',
  'electron/main',
  'src/components',
  'src/components/SettingsModal',
  'tests'
]

function extractRoadmapFileRefs(filesField: string): string[] {
  const refs = new Set<string>()
  for (const match of filesField.matchAll(/`([^`]+)`/g)) refs.add(match[1].trim())
  for (const part of filesField.split(/[,;]/)) {
    const trimmed = part.trim().replace(/^`|`$/g, '')
    if (trimmed && (/\.(tsx?|jsx?|md|css|mjs)$/i.test(trimmed) || trimmed.includes('/'))) {
      refs.add(trimmed)
    }
  }
  return [...refs]
}

function tryAddRoadmapPath(
  sourceRoot: string,
  rel: string,
  seen: Set<string>,
  out: string[]
): void {
  const norm = rel.replace(/\\/g, '/').replace(/^app\//, '')
  if (!norm || seen.has(norm)) return
  if (existsSync(join(sourceRoot, norm))) {
    seen.add(norm)
    out.push(norm)
  }
}

export function resolveRoadmapFileHints(filesField: string, sourceRoot: string): string {
  const resolved: string[] = []
  const seen = new Set<string>()

  for (const ref of extractRoadmapFileRefs(filesField)) {
    const key = ref.replace(/\\/g, '/').toLowerCase().replace(/\/$/, '')
    const aliasPaths =
      ROADMAP_PATH_ALIASES[key] ?? ROADMAP_PATH_ALIASES[basename(key).toLowerCase()]
    if (aliasPaths) {
      for (const p of aliasPaths) tryAddRoadmapPath(sourceRoot, p, seen, resolved)
      continue
    }

    if (
      ref.startsWith('electron/') ||
      ref.startsWith('src/') ||
      ref.startsWith('tests/') ||
      ref.startsWith('shared/')
    ) {
      tryAddRoadmapPath(sourceRoot, ref, seen, resolved)
      continue
    }
    if (ref.startsWith('app/')) {
      tryAddRoadmapPath(sourceRoot, ref.slice(4), seen, resolved)
      continue
    }

    const bn = basename(ref)
    for (const dir of ROADMAP_SEARCH_DIRS) {
      tryAddRoadmapPath(sourceRoot, `${dir}/${bn}`, seen, resolved)
    }
  }

  const lines = resolved.map((p) => `- ${p}`)
  let note = ''
  if (/ModelTab\/providers/i.test(filesField)) {
    note =
      '\n\nПримечание: каталога ModelTab/providers/ нет — UI провайдеров в src/components/SettingsModal/ModelTab.tsx.'
  }
  if (/index_project/i.test(filesField)) {
    note +=
      '\n\nindex_project из UI: window.codeviper.autoIndexProject(projectPath, ollamaUrl, qdrantUrl) — preload electron/preload/index.ts; handler electron/main/agentHandlersProject.ts.'
  }
  if (resolved.length === 0) {
    return note ? `\n\n${note.trim()}` : ''
  }
  return `\n\nПути для read_codeviper_file (относительно app/):\n${lines.join('\n')}${note}`
}

export function formatRoadmapItemDetail(item: RoadmapItemDetail, sourceRoot?: string): string {
  const base = [
    `Пункт ${item.num} · ${item.size} · ${item.title} (${item.chain})`,
    '',
    `Цель: ${item.goal}`,
    `Файлы: ${item.files}`,
    `Действие: ${item.action}`,
    `Проверка: ${item.verification}`
  ].join('\n')
  const hints = sourceRoot ? resolveRoadmapFileHints(item.files, sourceRoot) : ''
  return base + hints
}
