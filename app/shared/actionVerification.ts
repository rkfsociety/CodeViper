export const MUTATING_TOOLS = new Set([
  'write_file',
  'create_file',
  'edit_file',
  'append_file',
  'delete_file',
  'move_file',
  'run_command',
  'remember',
  'forget',
  'create_skill',
  'update_skill',
  'delete_skill',
  'write_skill_data',
  'write_codeviper_file',
  'create_codeviper_file',
  'edit_codeviper_file',
  'append_codeviper_file',
  'delete_codeviper_file',
  'move_codeviper_file',
  'run_codeviper_command',
  'create_ollama_model',
  'create_codeviper_pr'
])

const MUTATION_TASK_PATTERNS: RegExp[] = [
  /(?:создай|сделай|добавь|запиши|измени|исправь|обнови|удали|реализуй|внедри|улучш)/iu,
  /(?:skill|навык|файл|скрипт|функци|компонент|тест|readme|интерфейс|дизайн)/iu,
  /(?:^|\s)(?:ui|ux|css|стил)/iu,
  /(?:обучи|дообуч|train|fine-tune|modelfile)/iu,
  /(?:create|add|write|fix|update|delete|implement|refactor|improve|design)/i
]

/** Задачи, где агент обязан вызвать инструменты (чтение или запись), а не советовать пользователю. */
const TOOL_TASK_PATTERNS: RegExp[] = [
  ...MUTATION_TASK_PATTERNS,
  /(?:изучи|посмотри|проанализиру|ознаком|review|исследуй|найди|проверь)/iu,
  /(?:codeviper|code\s*viper)/i
]

const ADVICE_INSTEAD_OF_ACTION_PATTERNS: RegExp[] = [
  /(?:используйте|воспользуйтесь|откройте|установите)\s+(?:figma|sketch|material|ant design)/iu,
  /(?:проведите|организуйте)\s+тестирование/iu,
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\d+\.|[-*])\s+.+(?:шаг|этап|инструкц)/iu,
  /(?:^|\n)\s*#{1,3}\s+инструкци/iu,
  /после выполнения (?:этих )?шагов/iu,
  /(?:^|\n)\s*(?:\d+\.\s*)+\*\*[^*]+\*\*/mu,
  /(?:^|\n)\s*\d+\.\s+используйте/iu
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

export function taskLikelyNeedsTools(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  return TOOL_TASK_PATTERNS.some((pattern) => pattern.test(text))
}

export function looksLikeAdviceInsteadOfAction(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return ADVICE_INSTEAD_OF_ACTION_PATTERNS.some((pattern) => pattern.test(text))
}

export function claimsActionCompleted(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false

  if (
    /созда(?:ю|ем|ет)/i.test(text) &&
    !/(?:создал|создан|создана|создано)(?=\s|[.!?]|$)/i.test(text)
  ) {
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

export function shouldRetryForMissingTools(
  userMessage: string,
  assistantText: string,
  mutatingToolsUsed: ReadonlySet<string>,
  anyToolsUsed: boolean
): boolean {
  if (!taskLikelyNeedsTools(userMessage)) return false

  const mutationTask = taskLikelyNeedsMutation(userMessage)
  const toolsMissing = mutationTask ? mutatingToolsUsed.size === 0 : !anyToolsUsed
  if (!toolsMissing) return false

  if (!assistantText.trim()) return false

  return (
    claimsActionCompleted(assistantText) ||
    looksLikeAdviceInsteadOfAction(assistantText) ||
    assistantText.length > 80
  )
}

export const TOOL_VERIFICATION_NUDGE = `STOP. Не давай пользователю пошаговый план и не советуй Figma/Material-UI — это делаешь ТЫ через инструменты.
Сейчас вызови tool calling: list_directory / read_file или list_codeviper_directory / read_codeviper_file для изучения, затем create_file / edit_file / write_file (или codeviper_* аналоги) для правок.
Не пиши JSON вызова инструмента текстом — только официальный tool calling.
После успешных инструментов — одно короткое сообщение, что изменено.`

export const TOOL_VERIFICATION_FAILED_MESSAGE =
  'Не удалось выполнить действие: модель не вызвала инструменты. Проверь модель с tool calling (qwen2.5-coder:7b, llama3.1:8b) или переформулируй задачу.'
