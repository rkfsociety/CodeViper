import { appendFile, readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join, resolve, basename } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'
import { getBundledSourceRoot } from './bundledSourceSync'
import { extractRoadmapTitleFromTask } from '../../shared/selfImprovement'

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

const ROADMAP_ITEM_HEADER_RE =
  /^\*\*(\d+)\s+·\s+(S|M|L|XL)\s+·\s+(.+?)\*\*(?:\s+—\s+(?:приор\.\s+(\S+)|уровень\s+(\d+)))?/
const ROADMAP_FIELD_RE = /^- \*\*(Цель|Файлы|Действие|Проверка):\*\*\s*(.*)/

function normalizeRoadmapLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function parseRoadmapField(line: string): { key: string; value: string } | null {
  const match = line.match(ROADMAP_FIELD_RE)
  if (!match) return null
  return { key: match[1], value: match[2].trim() }
}

function applyRoadmapField(target: Partial<RoadmapItemDetail>, key: string, value: string): void {
  switch (key) {
    case 'Цель':
      target.goal = value
      break
    case 'Файлы':
      target.files = value
      break
    case 'Действие':
      target.action = value
      break
    case 'Проверка':
      target.verification = value
      break
  }
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

/** ROADMAP.md в корне репозитория — не внутри app/. */
export function resolveRoadmapPath(): string | null {
  const candidates = [join(getCodeViperSourceRoot(), '..', 'ROADMAP.md')]
  try {
    candidates.push(join(getBundledSourceRoot(), 'ROADMAP.md'))
  } catch {
    /* electron app не инициализирован (vitest, node) */
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
    /* vitest */
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

/** Ищет строку в ROADMAP_DONE.md по заголовку/ключевым словам задачи. */
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

export async function listRoadmapItems(): Promise<RoadmapItem[]> {
  const roadmapPath = resolveRoadmapPath()
  if (!roadmapPath) return []

  const content = await readFile(roadmapPath, 'utf-8')
  const lines = normalizeRoadmapLines(content)

  const items: RoadmapItem[] = []
  let inPlans = false
  let currentChain = 'Независимые'

  for (const line of lines) {
    if (line.startsWith('## 📋') || line.startsWith('## В планах')) {
      inPlans = true
      continue
    }
    if (inPlans && line.startsWith('## ') && !line.startsWith('###')) {
      inPlans = false
      continue
    }
    if (!inPlans) continue

    // Заголовок цепочки или уровня
    const chainMatch = line.match(/^###\s+[\u{1F517}\u26A1\u{1F7E0}\u{1F7E1}\u{1F7E2}]\s+(.+)/u)
    if (chainMatch) {
      currentChain = chainMatch[1].trim()
      continue
    }

    // Пункт: **N · SIZE · Title** — приор. PRIORITY | уровень N
    const itemMatch = line.match(ROADMAP_ITEM_HEADER_RE)
    if (itemMatch) {
      items.push({
        num: parseInt(itemMatch[1], 10),
        size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
        title: itemMatch[3].trim(),
        priority: itemMatch[4] ?? (itemMatch[5] ? `уровень ${itemMatch[5]}` : 'Low'),
        chain: currentChain
      })
    }
  }

  return items
}

/** Текстовый список для агента: num · title · chain */
export function formatRoadmapItemsList(items: RoadmapItem[]): string {
  if (items.length === 0) {
    return 'ROADMAP.md не найден или в разделе «В планах» нет пунктов.'
  }
  const lines = items.map((it) => `${it.num} · ${it.title} · ${it.chain}`)
  return `Пункты ROADMAP «В планах» (${items.length}):\n\n${lines.join('\n')}`
}

export async function readRoadmapItem(num: number): Promise<RoadmapItemDetail | null> {
  const roadmapPath = resolveRoadmapPath()
  if (!roadmapPath) return null

  const content = await readFile(roadmapPath, 'utf-8')
  const lines = normalizeRoadmapLines(content)

  let inPlans = false
  let currentChain = 'Независимые'
  let current: Partial<RoadmapItemDetail> | null = null

  const finishIfMatch = (): RoadmapItemDetail | null => {
    if (current?.num === num) {
      return toRoadmapItemDetail(current)
    }
    return null
  }

  for (const line of lines) {
    if (line.startsWith('## 📋') || line.startsWith('## В планах')) {
      inPlans = true
      continue
    }
    if (inPlans && line.startsWith('## ') && !line.startsWith('###')) {
      break
    }
    if (!inPlans) continue

    const chainMatch = line.match(/^###\s+[\u{1F517}\u26A1\u{1F7E0}\u{1F7E1}\u{1F7E2}]\s+(.+)/u)
    if (chainMatch) {
      currentChain = chainMatch[1].trim()
      continue
    }

    const itemMatch = line.match(ROADMAP_ITEM_HEADER_RE)
    if (itemMatch) {
      const found = finishIfMatch()
      if (found) return found

      current = {
        num: parseInt(itemMatch[1], 10),
        size: itemMatch[2] as 'S' | 'M' | 'L' | 'XL',
        title: itemMatch[3].trim(),
        priority: itemMatch[4] ?? (itemMatch[5] ? `уровень ${itemMatch[5]}` : 'Low'),
        chain: currentChain
      }
      continue
    }

    if (current) {
      const field = parseRoadmapField(line)
      if (field) applyRoadmapField(current, field.key, field.value)
    }
  }

  return finishIfMatch()
}

export async function appendRoadmapDoneItem(item: RoadmapItemDetail): Promise<void> {
  const donePath = resolveRoadmapDonePath()
  if (!donePath) {
    throw new Error('ROADMAP_DONE.md не найден')
  }
  const entry = `${formatRoadmapItemDetail(item)}\n`
  const prefix = (await readFile(donePath, 'utf-8')).trimEnd()
  const separator = prefix.length > 0 ? '\n\n' : ''
  await appendFile(donePath, `${separator}${entry}`, 'utf-8')
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
  for (const match of filesField.matchAll(/`([^`]+)`/g)) {
    refs.add(match[1].trim())
  }
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

/** Разрешает пути из поля «Файлы» ROADMAP в реальные пути относительно app/. */
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

/** Текстовый блок пункта для агента: цель / файлы / действие / проверка */
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
