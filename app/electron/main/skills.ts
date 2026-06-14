import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { makeId } from '../../shared/makeId'
import type { AgentSkill, MemoryScope, SkillsStore } from '../../src/types'

const MAX_GLOBAL_SKILLS = 30
const MAX_PROJECT_SKILLS = 20
const MAX_INJECT_SKILLS = 6

function globalSkillsPath(): string {
  return join(app.getPath('userData'), 'skills.json')
}

function globalSkillDataDir(): string {
  return join(app.getPath('userData'), 'skill-data')
}

function projectDir(projectPath: string): string {
  return join(projectPath, '.codeviper')
}

function projectSkillsPath(projectPath: string): string {
  return join(projectDir(projectPath), 'skills.json')
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

async function loadStore(filePath: string): Promise<SkillsStore> {
  if (!existsSync(filePath)) return emptyStore()

  try {
    const raw = await readFile(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as SkillsStore
    if (!Array.isArray(parsed.skills)) return emptyStore()
    return parsed
  } catch {
    return emptyStore()
  }
}

async function saveStore(filePath: string, store: SkillsStore): Promise<void> {
  await mkdir(join(filePath, '..'), { recursive: true })
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8')
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

function dataDir(scope: MemoryScope, projectPath: string): string {
  return scope === 'project' && projectPath ? projectSkillDataDir(projectPath) : globalSkillDataDir()
}

function skillDataPath(scope: MemoryScope, projectPath: string, skillId: string): string {
  return join(dataDir(scope, projectPath), `${skillId}.json`)
}

export async function listSkills(projectPath: string): Promise<AgentSkill[]> {
  const global = await loadStore(globalSkillsPath())
  const project = projectPath ? await loadStore(projectSkillsPath(projectPath)) : emptyStore()

  return [...global.skills, ...project.skills].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt)
  )
}

export async function getSkill(
  projectPath: string,
  id: string,
  scope?: MemoryScope
): Promise<AgentSkill | null> {
  const paths =
    scope === 'project' && projectPath
      ? [projectSkillsPath(projectPath)]
      : scope === 'global'
        ? [globalSkillsPath()]
        : [globalSkillsPath(), ...(projectPath ? [projectSkillsPath(projectPath)] : [])]

  for (const path of paths) {
    const store = await loadStore(path)
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

  const scope: MemoryScope =
    input.scope ?? (projectPath ? 'project' : 'global')
  const filePath = storePath(scope, projectPath)
  const max = scope === 'project' ? MAX_PROJECT_SKILLS : MAX_GLOBAL_SKILLS
  const store = await loadStore(filePath)
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
  const paths = [globalSkillsPath(), ...(projectPath ? [projectSkillsPath(projectPath)] : [])]

  for (const path of paths) {
    const store = await loadStore(path)
    const skill = store.skills.find((item) => item.id === id)
    if (!skill) continue

    if (patch.name !== undefined) skill.name = patch.name.trim() || skill.name
    if (patch.description !== undefined) skill.description = patch.description.trim()
    if (patch.instructions !== undefined) skill.instructions = patch.instructions.trim()
    if (patch.triggers !== undefined) skill.triggers = normalizeTriggers(patch.triggers)
    skill.updatedAt = new Date().toISOString()

    await saveStore(path, store)
    return skill
  }

  return null
}

export async function deleteSkill(projectPath: string, id: string): Promise<boolean> {
  const paths = [globalSkillsPath(), ...(projectPath ? [projectSkillsPath(projectPath)] : [])]

  for (const path of paths) {
    const store = await loadStore(path)
    const index = store.skills.findIndex((item) => item.id === id)
    if (index < 0) continue

    const [removed] = store.skills.splice(index, 1)
    await saveStore(path, store)

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
  const store = await loadStore(path)
  const target = store.skills.find((item) => item.id === skillId)
  if (target) {
    target.updatedAt = skill.updatedAt
    target.useCount = skill.useCount
    await saveStore(path, store)
  }

  return true
}

function scoreSkill(skill: AgentSkill, query: string): number {
  const q = query.toLowerCase()
  let score = skill.useCount

  if (skill.name.toLowerCase().includes(q)) score += 6
  if (skill.description.toLowerCase().includes(q)) score += 4
  if (skill.instructions.toLowerCase().includes(q)) score += 2

  for (const trigger of skill.triggers) {
    if (q.includes(trigger.toLowerCase()) || trigger.toLowerCase().includes(q)) {
      score += 8
    }
  }

  return score
}

export async function buildSkillsContext(projectPath: string, taskHint = ''): Promise<string> {
  const all = await listSkills(projectPath)
  if (!all.length) return ''

  const ranked = [...all]
    .map((skill) => ({ skill, score: scoreSkill(skill, taskHint) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_INJECT_SKILLS)
    .map(({ skill }) => skill)

  for (const skill of ranked) {
    skill.useCount += 1
    skill.updatedAt = new Date().toISOString()
  }

  if (ranked.length) {
    const globalStore = await loadStore(globalSkillsPath())
    const projectStore = projectPath ? await loadStore(projectSkillsPath(projectPath)) : emptyStore()

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
      `${index + 1}. **${skill.name}** (\`${skill.id}\`, ${skill.scope}) — ${skill.description || 'без описания'}` +
      (skill.triggers.length ? `\n   Триггеры: ${skill.triggers.join(', ')}` : '')
  )

  return (
    '## Активные навыки (skills)\n' +
    summaries.join('\n') +
    '\n\nДля полной инструкции вызови read_skill(id). Данные навыка — read_skill_data / write_skill_data.'
  )
}

export async function touchSkill(projectPath: string, id: string): Promise<void> {
  const skill = await getSkill(projectPath, id)
  if (!skill) return

  skill.useCount += 1
  skill.updatedAt = new Date().toISOString()
  const path = storePath(skill.scope, projectPath)
  const store = await loadStore(path)
  const target = store.skills.find((item) => item.id === id)
  if (!target) return

  target.useCount = skill.useCount
  target.updatedAt = skill.updatedAt
  await saveStore(path, store)
}
