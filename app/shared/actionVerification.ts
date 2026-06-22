export const MUTATING_TOOLS = new Set([
  'write_file',
  'create_file',
  'edit_file',
  'append_file',
  'delete_file',
  'move_file',
  'run_command',
  'run_script',
  'create_gitlab_mr',
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
  'create_codeviper_pr',
  'index_project',
  'create_jira_issue'
])

const MUTATION_TASK_PATTERNS: RegExp[] = [
  /(?:создай|сделай|добавь|запиши|измени|исправь|обнови|удали|реализуй|внедри|улучш)/iu,
  /(?:skill|навык|файл|скрипт|функци|компонент|тест|readme|интерфейс|дизайн)/iu,
  /(?:^|\s)(?:ui|ux|css|стил)/iu,
  /(?:обучи|дообуч|train|fine-tune|modelfile)/iu,
  /(?:create|add|write|fix|update|delete|implement|refactor|improve|design)/i
]

/** Паттерны высокой уверенности — явные команды на изменение */
const HIGH_CONFIDENCE_MUTATION_PATTERNS: RegExp[] = [
  /(?:создай|сделай|добавь|запиши|удали|реализуй|внедри)/iu,
  /(?:create|add|write|delete|implement)/i,
  /(?:обучи|дообуч|train|fine-tune)/iu
]

/** Паттерны неопределённости — слова, которые могут быть как командой, так и вопросом */
const UNCERTAIN_MUTATION_PATTERNS: RegExp[] = [
  /(?:измени|исправь|обнови|улучш)/iu,
  /(?:fix|update|refactor|improve|design|change)/i
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

/** Паттерны для информационных вопросов (просто ответить, без обязательных инструментов) */
const INFORMATION_ONLY_PATTERNS: RegExp[] = [
  /^[^?.]*\?+\s*$/i, // Заканчивается вопросом
  /(?:какие|какой|когда|где|почему|как|что|кто)\s+/iu, // Вопросительные слова
  /(?:посоветуй|порекомендуй|предложи|подскажи)\s+/iu, // Просьбы о совете
  /(?:рассказ|объясн|опиш|перечисл)\s+/iu, // Информационные глаголы
  /(?:список|перечень|обзор|краткой|кратко|суть)\s+/iu // Информационные термины
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

/**
 * Возвращает уровень уверенности что задача требует мутации файлов/кода:
 * - 'high': явные команды (создай, добавь, delete, implement...)
 * - 'uncertain': неоднозначные слова (исправь, fix, update...) — стоит уточнить через LLM
 * - 'none': не похоже на задачу с мутацией
 */
export function taskMutationLikelihood(userMessage: string): 'high' | 'uncertain' | 'none' {
  const text = userMessage.trim()
  if (!text) return 'none'
  if (HIGH_CONFIDENCE_MUTATION_PATTERNS.some((p) => p.test(text))) return 'high'
  if (UNCERTAIN_MUTATION_PATTERNS.some((p) => p.test(text))) return 'uncertain'
  return 'none'
}

export function isInformationOnlyQuestion(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  // Если это информационный вопрос, то инструменты не требуются
  return INFORMATION_ONLY_PATTERNS.some((pattern) => pattern.test(text))
}

export function taskLikelyNeedsTools(userMessage: string): boolean {
  const text = userMessage.trim()
  if (!text) return false
  // Информационные вопросы не требуют инструментов, даже если совпадают с TOOL_TASK_PATTERNS
  if (isInformationOnlyQuestion(text)) return false
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

  // Не-мутационная задача (изучи/перечисли/проанализируй) без вызова инструментов:
  // короткий ответ (<200 симв.) — модель написала намерение и остановилась, повторяем;
  // длинный ответ — облачная/умная модель ответила из знаний, принимаем как есть.
  if (!mutationTask && !anyToolsUsed) {
    return assistantText.trim().length < 200
  }

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
