import { readdir, readFile, stat } from 'fs/promises'
import { join, resolve } from 'path'
import { listSkills } from './skills'

type SkillFrontmatter = {
  name?: string
  description?: string
  triggers?: string[]
}

export type SkillFileIssue = {
  file: string
  skill?: string
  type: 'missing-frontmatter' | 'empty-trigger' | 'duplicate-trigger'
  trigger?: string
  message: string
}

function parseFrontmatter(raw: string): { meta: SkillFrontmatter; body: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!match) return null

  const meta: SkillFrontmatter = {}
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf(':')
    if (idx < 0) continue
    const key = trimmed.slice(0, idx).trim().toLowerCase()
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^['"]|['"]$/g, '')
    if (key === 'name' && value) meta.name = value
    if (key === 'description' && value) meta.description = value
    if (key === 'triggers') {
      meta.triggers = value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    }
  }

  return { meta, body: (match[2] ?? '').trim() }
}

async function collectSkillFiles(skillsDir: string): Promise<string[]> {
  const entries = await readdir(skillsDir, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    files.push(join(skillsDir, entry.name, 'SKILL.md'))
  }
  return files
}

function formatTriggerSet(triggers: string[]): string {
  return [...new Set(triggers)].join(', ')
}

export async function findSkillFileIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const skillsDir = resolve(projectPath, options.path?.trim() || 'skills')
  let dirInfo
  try {
    dirInfo = await stat(skillsDir)
  } catch {
    return `skills dir не найден: ${skillsDir}`
  }
  if (!dirInfo.isDirectory()) return `skills dir не найден: ${skillsDir}`

  const runtimeSkills = await listSkills(projectPath)
  const runtimeTriggers = new Map<string, string[]>()
  for (const skill of runtimeSkills) {
    for (const trigger of skill.triggers ?? []) {
      const key = trigger.trim()
      if (!key) continue
      const items = runtimeTriggers.get(key) ?? []
      items.push(skill.id)
      runtimeTriggers.set(key, items)
    }
  }

  const issues: SkillFileIssue[] = []
  const seenFileTriggers = new Map<string, string[]>()
  const files = await collectSkillFiles(skillsDir)

  for (const file of files) {
    let raw = ''
    try {
      raw = await readFile(file, 'utf8')
    } catch {
      continue
    }

    const parsed = parseFrontmatter(raw)
    const skillName = file.split(/[\\/]/).slice(-2, -1)[0]
    if (!parsed) {
      issues.push({
        file,
        skill: skillName,
        type: 'missing-frontmatter',
        message: 'нет frontmatter или он не распознан'
      })
      continue
    }

    const triggerList = parsed.meta.triggers ?? []
    if (!triggerList.length) {
      issues.push({
        file,
        skill: parsed.meta.name ?? skillName,
        type: 'empty-trigger',
        message: 'пустой trigger'
      })
      continue
    }

    for (const trigger of triggerList) {
      const normalized = trigger.trim()
      if (!normalized) continue
      const local = seenFileTriggers.get(normalized) ?? []
      local.push(file)
      seenFileTriggers.set(normalized, local)
    }
  }

  for (const [trigger, filesWithTrigger] of seenFileTriggers.entries()) {
    if (filesWithTrigger.length < 2 && !runtimeTriggers.has(trigger)) continue
    const duplicates = [
      ...filesWithTrigger,
      ...(runtimeTriggers.get(trigger) ?? []).map((id) => `list_skills:${id}`)
    ]
    issues.push({
      file: filesWithTrigger[0]!,
      type: 'duplicate-trigger',
      trigger,
      message: `дубликат trigger "${trigger}" (${formatTriggerSet(duplicates)})`
    })
  }

  if (!issues.length) return 'Битых SKILL.md не найдено.'

  return [
    `Найдено ${issues.length} проблем SKILL.md:`,
    ...issues.map((issue, index) => {
      const prefix = `[${index + 1}] ${issue.file}`
      const skill = issue.skill ? ` · ${issue.skill}` : ''
      const trigger = issue.trigger ? ` · trigger=${issue.trigger}` : ''
      return `${prefix}${skill}${trigger}\n    ${issue.message}`
    })
  ].join('\n')
}
