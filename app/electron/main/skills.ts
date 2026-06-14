import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { makeId } from '../../shared/makeId'
import { BUILTIN_SKILL_IDS } from '../../shared/builtinSkills'
import {
  formatAppliedSkillsBlock,
  scoreSkill,
  shouldApplySkill
} from '../../shared/skillMatching'
import type { AgentSkill, MemoryScope, SkillsStore } from '../../src/types'

export const SKILLS_FILENAME = 'ViperSkills.md'
const LEGACY_SKILLS_FILENAME = 'skills.json'

const MAX_GLOBAL_SKILLS = 30
const MAX_PROJECT_SKILLS = 20
const MAX_INJECT_SKILLS = 12

function globalSkillsPath(): string {
  return join(app.getPath('userData'), SKILLS_FILENAME)
}

function legacyGlobalSkillsPath(): string {
  return join(app.getPath('userData'), LEGACY_SKILLS_FILENAME)
}

function globalSkillDataDir(): string {
  return join(app.getPath('userData'), 'skill-data')
}

function projectDir(projectPath: string): string {
  return join(projectPath, '.codeviper')
}

function projectSkillsPath(projectPath: string): string {
  return join(projectDir(projectPath), SKILLS_FILENAME)
}

function legacyProjectSkillsPath(projectPath: string): string {
  return join(projectDir(projectPath), LEGACY_SKILLS_FILENAME)
}

function projectSkillDataDir(projectPath: string): string {
  return join(projectDir(projectPath), 'skill-data')
}

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04ff]+/gi, '-')
    .replace(/^-+|-+$/g, '')
  return slug || makeId()
}

function emptyStore(): SkillsStore {
  return { version: 1, skills: [] }
}

export function parseSkillsMarkdown(raw: string): SkillsStore {
  const match = raw.match(/<!-- viper-skills-store\n([\s\S]*?)\n-->/)
  if (!match) return emptyStore()

  try {
    const parsed = JSON.parse(match[1]) as SkillsStore
    if (!Array.isArray(parsed.skills)) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

export function renderSkillsMarkdown(store: SkillsStore): string {
  const lines = [
    '# ViperSkills',
    '',
    'Глобальные навыки агента CodeViper. Создаются через `create_skill`, сохраняются здесь и применяются автоматически по триггерам.',
    '',
    '<!-- viper-skills-store',
    JSON.stringify(store),
    '-->',
    '',
    '## Навыки',
    ''
  ]

  if (!store.skills.length) {
    lines.push('_Пока пусто._')
  } else {
    for (const skill of store.skills) {
      const triggers = skill.triggers.length ? skill.triggers.join(', ') : '—'
      lines.push(`### ${skill.id} · ${skill.name} · ${skill.scope}`)
      lines.push(`**Описание:** ${skill.description || '—'}`)
      lines.push(`**Триггеры:** ${triggers} · **Использовано:** ${skill.useCount}`)
      lines.push('')
      lines.push(skill.instructions)
      lines.push('')
      lines.push('---')
      lines.push('')
    }
  }

  return lines.join('\n')
}

async function loadLegacyJson(path: string): Promise<SkillsStore | null> {
  if (!existsSync(path)) return null

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as SkillsStore
    if (!Array.isArray(parsed.skills)) return emptyStore()
    return parsed
  } catch {
    return null
  }
}

async function loadStore(mdPath: string, legacyPath: string): Promise<SkillsStore> {
  if (existsSync(mdPath)) {
    try {
      const raw = await readFile(mdPath, 'utf-8')
      return parseSkillsMarkdown(raw)
    } catch {
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

async function saveStore(filePath: string, store: SkillsStore): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, renderSkillsMarkdown(store), 'utf-8')
}

function trimStore(store: SkillsStore, max: number): SkillsStore {
  if (store.skills.length <= max) return store

  const sorted = [...store.skills].sort(
    (a, b) => b.useCount - a.useCount || b.updatedAt.localeCompare(a.updatedAt)
  )

  return { ...store, skills: sorted.slice(0, max) }
}

function normalizeTriggers(triggers?: string[] | string): string[] {
  if (!triggers) return []
  if (Array.isArray(triggers)) return triggers.map((t) => t.trim()).filter(Boolean)
  return triggers
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

function storePath(scope: MemoryScope, projectPath: string): string {
  return scope === 'project' && projectPath ? projectSkillsPath(projectPath) : globalSkillsPath()
}

function legacyStorePath(scope: MemoryScope, projectPath: string): string {
  return scope === 'project' && projectPath
    ? legacyProjectSkillsPath(projectPath)
    : legacyGlobalSkillsPath()
}

function dataDir(scope: MemoryScope, projectPath: string): string {
  return scope === 'project' && projectPath ? projectSkillDataDir(projectPath) : globalSkillDataDir()
}

function skillDataPath(scope: MemoryScope, projectPath: string, skillId: string): string {
  return join(dataDir(scope, projectPath), `${skillId}.json`)
}

export async function listSkills(projectPath: string): Promise<AgentSkill[]> {
  const global = await loadStore(globalSkillsPath(), legacyGlobalSkillsPath())
  const project = projectPath
    ? await loadStore(projectSkillsPath(projectPath), legacyProjectSkillsPath(projectPath))
    : emptyStore()

  return [...global.skills, ...project.skills].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
}

export async function getSkill(
  projectPath: string,
  id: string,
  scope?: MemoryScope
): Promise<AgentSkill | null> {
  const targets =
    scope === 'project' && projectPath
      ? [{ md: projectSkillsPath(projectPath), legacy: legacyProjectSkillsPath(projectPath) }]
      : scope === 'global'
        ? [{ md: globalSkillsPath(), legacy: legacyGlobalSkillsPath() }]
        : [
            { md: globalSkillsPath(), legacy: legacyGlobalSkillsPath() },
            ...(projectPath
              ? [{ md: projectSkillsPath(projectPath), legacy: legacyProjectSkillsPath(projectPath) }]
              : [])
          ]

  for (const { md, legacy } of targets) {
    const store = await loadStore(md, legacy)
    const skill = store.skills.find((item) => item.id === id)
    if (skill) return skill
  }

  return null
}

export async function createSkill(
  projectPath: string,
  input: {
    name: string
    description: string
    instructions: string
    triggers?: string[] | string
    scope?: MemoryScope
    id?: string
  }
): Promise<AgentSkill> {
  const name = input.name.trim()
  const description = input.description.trim()
  const instructions = input.instructions.trim()
  if (!name) throw new Error('У навыка должно быть имя')
  if (!instructions) throw new Error('У навыка должны быть instructions')

  // Навыки всегда глобальные — это поведение агента, не привязка к репозиторию
  const scope: MemoryScope = 'global'
  const filePath = storePath(scope, projectPath)
  const legacyPath = legacyStorePath(scope, projectPath)
  const max = scope === 'project' ? MAX_PROJECT_SKILLS : MAX_GLOBAL_SKILLS
  const store = await loadStore(filePath, legacyPath)
  const now = new Date().toISOString()

  let id = input.id?.trim() || slugify(name)
  if (store.skills.some((skill) => skill.id === id)) {
    id = `${id}-${makeId().slice(-4)}`
  }

  const skill: AgentSkill = {
    id,
    name,
    description,
    instructions,
    triggers: normalizeTriggers(input.triggers),
    scope,
    createdAt: now,
    updatedAt: now,
    useCount: 0
  }

  store.skills.unshift(skill)
  await saveStore(filePath, trimStore(store, max))
  return skill
}

export async function updateSkill(
  projectPath: string,
  id: string,
  patch: Partial<Pick<AgentSkill, 'name' | 'description' | 'instructions'>> & {
    triggers?: string[] | string
  }
): Promise<AgentSkill | null> {
  const targets = [
    { md: globalSkillsPath(), legacy: legacyGlobalSkillsPath() },
    ...(projectPath
      ? [{ md: projectSkillsPath(projectPath), legacy: legacyProjectSkillsPath(projectPath) }]
      : [])
  ]

  for (const { md, legacy } of targets) {
    const store = await loadStore(md, legacy)
    const skill = store.skills.find((item) => item.id === id)
    if (!skill) continue

    if (patch.name !== undefined) skill.name = patch.name.trim() || skill.name
    if (patch.description !== undefined) skill.description = patch.description.trim()
    if (patch.instructions !== undefined) skill.instructions = patch.instructions.trim()
    if (patch.triggers !== undefined) skill.triggers = normalizeTriggers(patch.triggers)
    skill.updatedAt = new Date().toISOString()

    await saveStore(md, store)
    return skill
  }

  return null
}

export async function deleteSkill(projectPath: string, id: string): Promise<boolean> {
  const targets = [
    { md: globalSkillsPath(), legacy: legacyGlobalSkillsPath() },
    ...(projectPath
      ? [{ md: projectSkillsPath(projectPath), legacy: legacyProjectSkillsPath(projectPath) }]
      : [])
  ]

  for (const { md, legacy } of targets) {
    const store = await loadStore(md, legacy)
    const index = store.skills.findIndex((item) => item.id === id)
    if (index < 0) continue

    const [removed] = store.skills.splice(index, 1)
    await saveStore(md, store)

    const dataPath = skillDataPath(removed.scope, projectPath, removed.id)
    if (existsSync(dataPath)) {
      await writeFile(dataPath, '{}', 'utf-8').catch(() => undefined)
    }

    return true
  }

  return false
}

export async function readSkillData(
  projectPath: string,
  skillId: string
): Promise<{ scope: MemoryScope; content: string } | null> {
  const skill = await getSkill(projectPath, skillId)
  if (!skill) return null

  const path = skillDataPath(skill.scope, projectPath, skillId)
  if (!existsSync(path)) {
    return { scope: skill.scope, content: '{}' }
  }

  try {
    return { scope: skill.scope, content: await readFile(path, 'utf-8') }
  } catch {
    return { scope: skill.scope, content: '{}' }
  }
}

export async function writeSkillData(
  projectPath: string,
  skillId: string,
  content: string
): Promise<boolean> {
  const skill = await getSkill(projectPath, skillId)
  if (!skill) return false

  const dir = dataDir(skill.scope, projectPath)
  await mkdir(dir, { recursive: true })
  await writeFile(skillDataPath(skill.scope, projectPath, skillId), content, 'utf-8')
  skill.updatedAt = new Date().toISOString()
  skill.useCount += 1

  const path = storePath(skill.scope, projectPath)
  const legacyPath = legacyStorePath(skill.scope, projectPath)
  const store = await loadStore(path, legacyPath)
  const target = store.skills.find((item) => item.id === skillId)
  if (target) {
    target.updatedAt = skill.updatedAt
    target.useCount = skill.useCount
    await saveStore(path, store)
  }

  return true
}

export async function buildSkillsContext(projectPath: string, taskHint = ''): Promise<string> {
  const all = await listSkills(projectPath)
  if (!all.length) return ''

  const builtinSet = new Set<string>(BUILTIN_SKILL_IDS)
  const builtins = all.filter((skill) => builtinSet.has(skill.id))
  const others = all.filter((skill) => !builtinSet.has(skill.id))

  const rankedOthers = [...others]
    .map((skill) => ({ skill, score: scoreSkill(skill, taskHint) }))
    .sort((a, b) => b.score - a.score)

  const seen = new Set<string>()
  const ranked: AgentSkill[] = []
  for (const skill of [...builtins, ...rankedOthers.map(({ skill }) => skill)]) {
    if (seen.has(skill.id)) continue
    seen.add(skill.id)
    ranked.push(skill)
    if (ranked.length >= MAX_INJECT_SKILLS) break
  }

  for (const skill of ranked) {
    skill.useCount += 1
    skill.updatedAt = new Date().toISOString()
  }

  if (ranked.length) {
    const globalStore = await loadStore(globalSkillsPath(), legacyGlobalSkillsPath())
    const projectStore = projectPath
      ? await loadStore(projectSkillsPath(projectPath), legacyProjectSkillsPath(projectPath))
      : emptyStore()

    for (const skill of ranked) {
      const store = skill.scope === 'project' ? projectStore : globalStore
      const target = store.skills.find((item) => item.id === skill.id)
      if (target) {
        target.useCount = skill.useCount
        target.updatedAt = skill.updatedAt
      }
    }

    await saveStore(globalSkillsPath(), globalStore)
    if (projectPath) await saveStore(projectSkillsPath(projectPath), projectStore)
  }

  const summaries = ranked.map(
    (skill, index) =>
      `${index + 1}. **${skill.name}** (\`${skill.id}\`) — ${skill.description || 'без описания'}` +
      (skill.triggers.length ? `\n   Триггеры: ${skill.triggers.join(', ')}` : '')
  )

  const applied = ranked
    .filter((skill) => shouldApplySkill(skill, taskHint, builtinSet.has(skill.id)))
    .slice(0, 4)

  return (
    '## ViperSkills — навыки агента\n' +
    'Все навыки глобальные (%APPDATA%/CodeViper/ViperSkills.md), переживают перезапуск и смену проекта.\n\n' +
    summaries.join('\n') +
    formatAppliedSkillsBlock(applied) +
    '\n\nДля остальных навыков — read_skill(id). Данные навыка — read_skill_data / write_skill_data.'
  )
}

export async function touchSkill(projectPath: string, id: string): Promise<void> {
  const skill = await getSkill(projectPath, id)
  if (!skill) return

  skill.useCount += 1
  skill.updatedAt = new Date().toISOString()
  const path = storePath(skill.scope, projectPath)
  const legacyPath = legacyStorePath(skill.scope, projectPath)
  const store = await loadStore(path, legacyPath)
  const target = store.skills.find((item) => item.id === id)
  if (!target) return

  target.useCount = skill.useCount
  target.updatedAt = skill.updatedAt
  await saveStore(path, store)
}
