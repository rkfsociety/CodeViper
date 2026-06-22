import type { AgentStreamPayload } from '../../src/types'
import type { ToolHandlers } from './agentTools'
import { isBuiltinSkill } from '../../shared/builtinSkills'
import {
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  readSkillData,
  touchSkill,
  updateSkill,
  writeSkillData
} from './skills'

export function createSkillsToolHandlers(
  projectPath: string,
  emit: (event: AgentStreamPayload) => void
): Partial<ToolHandlers> {
  // @ts-expect-error TS parameter type mismatch
  const handlers: Partial<ToolHandlers> = {
    list_skills: async () => {
      const skills = await listSkills(projectPath)
      return JSON.stringify(skills, null, 2)
    },

    read_skill: async (args: any) => {
      const skill = await getSkill(projectPath, args.id)
      if (!skill) return `Навык не найден: ${args.id}`
      await touchSkill(projectPath, skill.id)
      return JSON.stringify(skill, null, 2)
    },

    create_skill: async (args: any) => {
      const skill = await createSkill(projectPath, {
        name: args.name,
        description: args.description,
        instructions: args.instructions,
        triggers: args.triggers,
        id: args.id
      })
      emit({ type: 'skill_saved', content: skill.name, skillId: skill.id })
      return `Навык агента создан (global): ${skill.name} (id: ${skill.id}) → ViperSkills.md`
    },

    update_skill: async (args: any) => {
      const skill = await updateSkill(projectPath, args.id, {
        name: args.name,
        description: args.description,
        instructions: args.instructions,
        triggers: args.triggers
      })
      if (!skill) return `Навык не найден: ${args.id}`
      emit({ type: 'skill_saved', content: skill.name, skillId: skill.id })
      return `Навык обновлён: ${skill.name} (id: ${skill.id})`
    },

    delete_skill: async (args: any) => {
      if (isBuiltinSkill(args.id)) {
        return `Нельзя удалить встроенный навык: ${args.id}`
      }
      const removed = await deleteSkill(projectPath, args.id)
      return removed ? `Навык удалён: ${args.id}` : `Навык не найден: ${args.id}`
    },

    read_skill_data: async (args: any) => {
      const data = await readSkillData(projectPath, args.skill_id)
      if (!data) return `Навык не найден: ${args.skill_id}`
      return data.content
    },

    write_skill_data: async (args: any) => {
      const ok = await writeSkillData(projectPath, args.skill_id, args.content)
      return ok ? `Данные навыка записаны: ${args.skill_id}` : `Навык не найден: ${args.skill_id}`
    }
  }
  return handlers
}
