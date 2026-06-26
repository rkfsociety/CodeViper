import { MUTATING_TOOLS } from './actionVerification'

export type PermissionMode = 'ask' | 'acceptEdits' | 'bypass'

export const PERMISSION_MODES: PermissionMode[] = ['ask', 'acceptEdits', 'bypass']

export const PERMISSION_MODE_LABELS: Record<PermissionMode, string> = {
  ask: 'Спрашивать всё',
  acceptEdits: 'Принимать правки, спрашивать команды',
  bypass: 'Без подтверждений'
}

// Инструменты, которые даже в режиме acceptEdits требуют подтверждения
// (запуск команд и создание моделей — потенциально опаснее правок файлов).
const CONFIRM_IN_ACCEPT_EDITS = new Set<string>([
  'run_command',
  'run_codeviper_command',
  'create_ollama_model',
  // Создание PR — внешнее действие (публикация на GitHub), подтверждаем всегда кроме bypass.
  'create_codeviper_pr',
  'git_commit',
  'git_push',
  'git_checkout'
])

export function normalizePermissionMode(value: unknown): PermissionMode {
  return value === 'ask' || value === 'acceptEdits' || value === 'bypass' ? value : 'bypass'
}

/** Нужно ли спрашивать подтверждение перед инструментом при данном режиме. */
export function toolRequiresConfirm(mode: PermissionMode, toolName: string): boolean {
  if (mode === 'bypass') return false
  if (!MUTATING_TOOLS.has(toolName)) return false
  if (mode === 'ask') return true
  return CONFIRM_IN_ACCEPT_EDITS.has(toolName)
}
