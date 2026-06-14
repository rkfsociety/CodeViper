export const MUTATING_TOOLS = new Set([
  'write_file',
  'run_command',
  'remember',
  'forget',
  'create_skill',
  'update_skill',
  'delete_skill',
  'write_skill_data'
])

const MUTATION_TASK_PATTERNS: RegExp[] = [
  /\b(?:создай|сделай|добавь|запиши|измени|исправь|обнови|удали|реализуй|внедри|улучши)\b/i,
  /\b(?:skill|навык|файл|скрипт|функци|компонент|тест|readme)\b/i,
  /\b(?:create|add|write|fix|update|delete|implement|refactor)\b/i
]

const COMPLETION_CLAIM_PATTERNS: RegExp[] = [
  /(?:создал|добавил|записал|обновил|исправил|удалил|сохранил|выполнил|реализовал)/i,
  /(?:создан|добавлен|записан|обновл[её]н|исправлен|удалён|удален|сохранён|сохранен)/i,
  /(?:skill|навык|файл|инструмент).{0,24}(?:создан|добавлен|записан|готов)/i,
  /(?:created|added|wrote|updated|fixed|deleted|saved|implemented)/i,
  /(?:successfully|done|completed)/i,
  /(?:^|\s)готово[.!]/i
]

export function taskLikelyNeedsMutation(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  return MUTATION_TASK_PATTERNS.some((pattern) => pattern.test(text))
}

export function claimsActionCompleted(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
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

export const TOOL_VERIFICATION_NUDGE = `Ты описал результат, но не вызвал инструменты (write_file, create_skill, run_command и т.д.).
Сейчас выполни задачу по-настоящему: вызови нужные инструменты и только после их успешного ответа кратко сообщи, что сделано.
Не утверждай, что файл/skill/правка уже созданы, пока инструмент не вернул успех.`
