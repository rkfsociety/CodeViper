import type { SkillsStore } from '../../src/types'

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
