import type { AgentSkill } from '../src/types'

export const SKILL_APPLY_THRESHOLD = 10
export const MAX_APPLIED_SKILL_INSTRUCTIONS = 4
export const MAX_SKILL_INSTRUCTIONS_CHARS = 4_500

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function scoreSkill(skill: AgentSkill, query: string): number {
  const q = query.trim().toLowerCase()
  if (!q) return skill.useCount

  let score = skill.useCount

  if (skill.name.toLowerCase().includes(q)) score += 6
  if (skill.description.toLowerCase().includes(q)) score += 4
  if (skill.instructions.toLowerCase().includes(q)) score += 2

  for (const trigger of skill.triggers) {
    const t = trigger.toLowerCase().trim()
    if (!t) continue

    if (q.includes(t)) score += 10

    try {
      const pattern = new RegExp(`(?:^|[\\s,.!?«»"'])${escapeRegex(t)}(?:[\\s,.!?«»"']|$)`, 'iu')
      if (pattern.test(query)) score += 14
    } catch {
      // ignore bad trigger regex
    }
  }

  return score
}

export function shouldApplySkill(skill: AgentSkill, query: string, isBuiltin: boolean): boolean {
  if (isBuiltin) return false
  if (skill.scope !== 'global') return false
  return scoreSkill(skill, query) >= SKILL_APPLY_THRESHOLD
}

export function truncateSkillInstructions(
  text: string,
  max = MAX_SKILL_INSTRUCTIONS_CHARS
): string {
  if (text.length <= max) return text
  return `${text.slice(0, max)}\n… (инструкция обрезана, read_skill для полного текста)`
}

export function formatAppliedSkillsBlock(skills: AgentSkill[]): string {
  if (!skills.length) return ''

  const blocks = skills.map(
    (skill) => `### ${skill.id} · ${skill.name}\n${truncateSkillInstructions(skill.instructions)}`
  )

  return (
    '\n\n## Применяемые навыки агента\n' +
    'Следующие навыки подходят к запросу — **выполняй их инструкции** (не только read_skill):\n\n' +
    blocks.join('\n\n')
  )
}
