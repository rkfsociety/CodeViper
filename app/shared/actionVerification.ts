export const MUTATING_TOOLS = new Set([
  'write_file',
  'run_command',
  'remember',
  'forget',
  'create_skill',
  'update_skill',
  'delete_skill',
  'write_skill_data',
  'write_codeviper_file',
  'run_codeviper_command'
])

const MUTATION_TASK_PATTERNS: RegExp[] = [
  /\b(?:создай|сделай|добавь|запиши|измени|исправь|обнови|удали|реализуй|внедри|улучши)\b/i,
  /\b(?:skill|навык|файл|скрипт|функци|компонент|тест|readme)\b/i,
  /\b(?:create|add|write|fix|update|delete|implement|refactor)\b/i
]

const COMPLETION_CLAIM_PATTERNS: RegExp[] = [
  /(?:^|[\s.!?])(?:я\s+)?(?:создал|добавил|записал|обновил|исправил|удалил|сохранил|выполнил|реализовал)(?=\s|[.!?]|$)/i,
  /(?:^|[\s.!?])(?:skill|навык|файл)\s+(?:создан|добавлен|записан|обновл[eё]н|готов)(?=\s|[.!?]|$)/i,
  /(?:^|[\s.!?])(?:created|added|wrote|updated|fixed|deleted|saved|implemented)(?=\s|[.!?]|$)/i,
  /(?:^|[\s.!?])готово[.!]\s*$/i
]

export function taskLikelyNeedsMutation(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  return MUTATION_TASK_PATTERNS.some((pattern) => pattern.test(text))
}

export function claimsActionCompleted(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false

  if (/созда(?:ю|ем|ет)/i.test(text) && !/(?:создал|создан|создана|создано)(?=\s|[.!?]|$)/i.test(text)) {
    return false
  }

  return COMPLETION_CLAIM_PATTERNS.some((pattern) => pattern.test(text))
}

export function needsToolVerification(
  userMessage: string,
  assistantText: string,
  mutatingToolsUsed: ReadonlySet<string>
): boolean {
  if (mutatingToolsUsed.size > 0) return false
  if (!taskLikelyNeedsMutation(userMessage)) return false
  return claimsActionCompleted(assistantText)
}

export const TOOL_VERIFICATION_NUDGE = `STOP. Не описывай план текстом.
Сейчас вызови нужный инструмент (create_skill, write_file, run_command и т.д.) через tool calling.
Для skill: create_skill с полями name, description, instructions.
После успешного ответа инструмента — одно короткое сообщение пользователю.`

export const TOOL_VERIFICATION_FAILED_MESSAGE =
  'Не удалось выполнить действие: модель не вызвала инструменты. Проверь модель с tool calling (qwen2.5-coder:7b, llama3.1:8b) или переформулируй задачу.'
