export const BUILTIN_SKILL_IDS = [
  'viper-agent-core',
  'viper-skills',
  'viper-files',
  'viper-codebase',
  'viper-terminal',
  'viper-self-edit',
  'viper-self-improvement',
  'viper-memory',
  'viper-model-training'
] as const

export type BuiltinSkillId = (typeof BUILTIN_SKILL_IDS)[number]

export const BUILTIN_SKILLS_VERSION = 2

export function isBuiltinSkill(id: string): id is BuiltinSkillId {
  return (BUILTIN_SKILL_IDS as readonly string[]).includes(id)
}
