/**
 * Контракт субагента: роли, лимиты, опции запуска.
 * Не содержит Node.js API — импортируется и из main, и из renderer.
 */

/** Роль субагента определяет доступный набор инструментов */
export type SubagentRole = 'explorer' | 'editor'

/** Инструменты, доступные роли «разведчик» (read-only) */
export const EXPLORER_ALLOWED_TOOLS: readonly string[] = [
  'read_file',
  'list_directory',
  'grep_search',
  'find_files',
  'get_file_info',
  'read_multiple_files',
  'search_memory',
  'list_memories',
  'list_skills',
  'run_command'
] as const

/** Инструменты, доступные роли «редактор» (mutating, без self-improve) */
export const EDITOR_ALLOWED_TOOLS: readonly string[] = [
  ...EXPLORER_ALLOWED_TOOLS,
  'edit_file',
  'write_file',
  'delete_file',
  'create_directory',
  'move_file',
  'patch_file',
  'remember',
  'forget',
  'create_skill',
  'delete_skill',
  'run_script',
  'run_command'
] as const

/** Максимальное число шагов субагента по роли */
export const SUBAGENT_MAX_STEPS: Record<SubagentRole, number> = {
  explorer: 10,
  editor: 20
}

export interface SubagentOptions {
  /** Роль субагента — определяет tool set и лимит шагов */
  role: SubagentRole
  /** Задача, передаваемая субагенту */
  task: string
  /** Путь к проекту */
  projectPath: string
  /** Переопределить лимит шагов (не больше максимума роли) */
  maxSteps?: number
  /**
   * Дополнительно исключить инструменты из разрешённого набора роли.
   * Полезно, когда caller хочет ограничить editor, запретив run_command.
   */
  disableTools?: string[]
  /** AbortSignal для прерывания */
  signal?: AbortSignal
}

export interface SubagentResult {
  /** Итоговый текстовый ответ субагента */
  output: string
  /** Число выполненных шагов */
  steps: number
  /** Завершился ли прогон штатно (не прерван, не вышел за лимит) */
  completed: boolean
  /** Имена вызванных инструментов в порядке вызова */
  toolsUsed: string[]
}

/** Вычислить допустимый набор инструментов для роли с учётом дополнительных исключений */
export function resolveAllowedTools(
  role: SubagentRole,
  disableTools?: string[]
): readonly string[] {
  const base = role === 'explorer' ? EXPLORER_ALLOWED_TOOLS : EDITOR_ALLOWED_TOOLS
  if (!disableTools?.length) return base
  const disabled = new Set(disableTools)
  return base.filter((t) => !disabled.has(t))
}

/** Вычислить реальный лимит шагов */
export function resolveMaxSteps(role: SubagentRole, maxSteps?: number): number {
  const cap = SUBAGENT_MAX_STEPS[role]
  if (maxSteps == null) return cap
  return Math.min(maxSteps, cap)
}
