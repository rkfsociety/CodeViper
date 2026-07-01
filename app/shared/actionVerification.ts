import { isCompactPromptModel } from './recommendedModels'
import { looksLikeEmbeddedToolCall } from './toolCalls'

export const MUTATING_TOOLS = new Set([
  'write_file',
  'create_file',
  'edit_file',
  'append_file',
  'delete_file',
  'move_file',
  'copy_file',
  'rename_folder',
  'copy_folder',
  'create_issue',
  'create_pr',
  'trigger_github_workflow',
  'run_command',
  'run_script',
  'format_project',
  'create_gitlab_mr',
  'remember',
  'forget',
  'create_skill',
  'update_skill',
  'delete_skill',
  'write_skill_data',
  'index_project',
  'create_jira_issue',
  'create_linear_issue',
  'delegate_to_editor',
  'git_commit',
  'git_push',
  'git_checkout',
  'git_stash',
  'git_stash_pop'
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
  /(?:^|\n)\s*#{1,3}\s*Действие\b/iu,
  /(?:^|\n)\s*#{1,3}\s*Проверка\b/iu,
  /(?:давайте|давай)\s+начн(?:ем|ём)\s+(?:реализацию|с\s|шаг)/iu,
  /Теперь давайте начн/i,
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

/** Вывод «уже сделано / правки не нужны» после изучения кода — не требует mutating tools. */
const ALREADY_IMPLEMENTED_PATTERNS: RegExp[] = [
  /уже\s+(?:реализован|корректн|сделан|есть|работает|внедрён|внедрена|внедрено)/iu,
  /логика\s+уже/iu,
  /(?:дополнительных?\s+)?правок\s+не\s+требуется/iu,
  /изменени[яй]\s+не\s+(?:нужн|требу)/iu,
  /already\s+implemented/i,
  /no\s+(?:further\s+)?changes?\s+(?:needed|required)/i,
  /nothing\s+(?:more\s+)?to\s+(?:change|do)/i
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

/** Модель описала результат инструмента текстом («Вывод: … завершено») без реального tool call. */
const FAKE_TOOL_OUTPUT_PATTERNS: RegExp[] = [
  /Вывод:\s*(?:Чтение|Успешн|Выполнен|Команда|git\s)/i,
  /Инструмент(?:ы)?\s+для\s+этого\s*:[\s\S]*?Вывод:/i,
  /Для начала выполним несколько шагов для разведки[\s\S]*Вывод:/i
]

/** Модель описала вызов инструмента текстом вместо native tool call. */
const SIMULATED_TOOL_TRANSCRIPT_PATTERNS: RegExp[] = [
  /Инструмент\s+(?:read|edit|write|create|list|grep|find|run|complete|set)_\w+:\s*[\s\S]*?(?:Путь|Файл|ID|Содержимое|Строка для замены):/i
]

export function looksLikeSimulatedToolTranscript(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return SIMULATED_TOOL_TRANSCRIPT_PATTERNS.some((pattern) => pattern.test(text))
}

export function looksLikeFakeToolOutput(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return (
    looksLikeSimulatedToolTranscript(text) ||
    FAKE_TOOL_OUTPUT_PATTERNS.some((pattern) => pattern.test(text))
  )
}

/** Модель описала вызов инструмента текстом/bash вместо native tool call (qwen2.5-coder). */
const PSEUDO_TOOL_INVOCATION_PATTERNS: RegExp[] = [
  /(?:^|\n)\s*(?:bash|shell|sh)\s*\n\s*(?:grep|read|edit|run)_(?:files|file|command)/im,
  /(?:^|\n)\s*(?:grep|read|edit|run)_(?:files|file|command)\s+\S/m,
  /(?:Используем|вызови|выполним)\s+`?(?:grep|read|edit|run)_(?:codeviper_)?(?:files|file|command)/iu,
  /(?:Пример команды|### Пример)[\s\S]{0,200}(?:grep|read|edit|run)_(?:codeviper_)?(?:files|file|command)/iu
]

export function looksLikePseudoToolInvocation(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return PSEUDO_TOOL_INVOCATION_PATTERNS.some((pattern) => pattern.test(text))
}

/** Общий паттерн «Инструмент tool_name:» без native tool call. */
const GENERIC_INSTRUMENT_LINE = /Инструмент\s+[\w_]+:/i

/** JSON-блок { "name": "…", "arguments": … } в тексте без native tool_calls. */
const INLINE_TOOL_JSON = /\{\s*"name"\s*:\s*"[\w_]+"[\s\S]{0,400}?"arguments"\s*:/i

/** Текст упоминает инструменты, но в API-ответе не было tool_calls. */
export function responseMentionsToolsWithoutCall(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return (
    looksLikeFakeToolOutput(text) ||
    looksLikePseudoToolInvocation(text) ||
    looksLikeEmbeddedToolCall(text) ||
    GENERIC_INSTRUMENT_LINE.test(text) ||
    INLINE_TOOL_JSON.test(text)
  )
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

/** Модель заключила, что код уже соответствует задаче — mutating tools не обязательны. */
export function looksLikeAlreadyImplementedConclusion(assistantText: string): boolean {
  const text = assistantText.trim()
  if (!text) return false
  return ALREADY_IMPLEMENTED_PATTERNS.some((pattern) => pattern.test(text))
}

/**
 * Принять текстовый ответ без mutating tools: агент уже читал код и сделал вывод.
 * Регрессия: ROADMAP-задача с «Файлы»/«тест» классифицируется как mutation, хотя правки не нужны.
 */
export function acceptTextAfterReadTools(
  assistantText: string,
  mutatingToolsUsed: ReadonlySet<string>,
  anyToolsUsed: boolean
): boolean {
  if (!anyToolsUsed || mutatingToolsUsed.size > 0) return false
  const text = assistantText.trim()
  if (!text) return false
  if (looksLikeAlreadyImplementedConclusion(text)) return true
  // Длинный ответ после read_* — обычно обзор/верификация, не застревание
  return text.length >= 200 && !claimsActionCompleted(text)
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

  if (!assistantText.trim()) {
    // Пустой ответ после разведки на задаче с правками — повторить с nudge
    return mutationTask && anyToolsUsed && mutatingToolsUsed.size === 0
  }

  if (acceptTextAfterReadTools(assistantText, mutatingToolsUsed, anyToolsUsed)) {
    return false
  }

  if (looksLikeFakeToolOutput(assistantText)) {
    return true
  }

  // Не-мутационная задача (изучи/перечисли/проанализируй) без вызова инструментов:
  // короткий ответ (<200 симв.) — модель написала намерение и остановилась, повторяем;
  // длинный ответ — облачная/умная модель ответила из знаний, принимаем как есть.
  if (!mutationTask && !anyToolsUsed) {
    return assistantText.trim().length < 200
  }

  return (
    claimsActionCompleted(assistantText) ||
    looksLikeAdviceInsteadOfAction(assistantText) ||
    looksLikePseudoToolInvocation(assistantText) ||
    assistantText.length > 80
  )
}

export const DUPLICATE_TOOL_BATCH_NUDGE = `⚠️ Ты повторяешь тот же набор инструментов, что и на прошлом шаге — результаты уже в истории.
Не вызывай снова project_stats / find_files / list_directory с теми же аргументами.
Прочитай найденные файлы (read_file) и переходи к правкам (write_file / edit_file), либо смени стратегию.`

export const CROSS_STEP_TOOL_REPEAT_NUDGE = `⚠️ Ты повторяешь инструменты с теми же аргументами, что уже вызывал на прошлом шаге — ответы уже в истории.
Не вызывай снова find_files / list_directory / read_file с теми же путями.
Прочитай найденные файлы из задачи и переходи к правкам (edit_file / write_file).`

export const IDENTICAL_ASSISTANT_NUDGE = `⚠️ Ты повторяешь тот же текст ответа, что и на прошлом шаге — это признак застревания.
Не повторяй разведку: прочитай файлы из поля «Файлы» задачи и начни правки (edit_file / write_file).`

export const EXPLORATION_STALL_NUDGE = `⚠️ Достаточно разведки — несколько шагов подряд только чтение/поиск без правок.
Задача требует изменения кода: вызови edit_file / preview_patch / write_file.
Не перечитывай те же файлы — правь файлы из задачи.`

export const EXPLORATION_STALL_ABORT_MESSAGE = `🛑 Прогон остановлен: слишком много шагов разведки (read/grep) без правок.
Вызови edit_file по целевым файлам или смените модель.`

export const FAKE_TOOL_OUTPUT_NUDGE = `STOP. Ты описал инструмент текстом («Инструмент read_file:» / «Вывод: … завершено») — это не выполнение.
Вызови реальный tool call: read_file / edit_file / run_command.
Не пиши JSON, не симулируй «Путь:» / «Содержимое файла:» — только официальный tool calling.`

export const FAKE_TOOL_OUTPUT_NUDGE_COMPACT = `STOP: только native tool_calls. Не пиши «Инструмент …» / «Путь:» / «Вывод:».`

export const HARD_TOOL_CALLING_SYSTEM_HINT = `## ОБЯЗАТЕЛЬНО (tool calling)
Ответ только через native tool_calls API. Запрещено писать «Инструмент …», «Путь:», «Содержимое файла:», «Вывод:» — это не выполнение.`

export const HARD_TOOL_CALLING_SYSTEM_HINT_COMPACT = `TOOL CALLS ONLY. No «Инструмент…»/«Путь:»/«Вывод:» text.`

export const SIMULATED_TOOL_ABORT_MESSAGE =
  'Прогон остановлен: модель симулирует инструменты текстом вместо tool_calls. Смените модель (14b+) или переформулируйте задачу.'

export const MAX_SIMULATED_TOOL_RESPONSE_RETRIES = 3

export const TOOL_VERIFICATION_NUDGE = `STOP. Не давай пользователю пошаговый план и не советуй Figma/Material-UI — это делаешь ТЫ через инструменты.
Сейчас вызови tool calling: list_directory / read_file для изучения, затем create_file / edit_file / write_file для правок.
Не пиши JSON вызова инструмента текстом — только официальный tool calling.
После успешных инструментов — одно короткое сообщение, что изменено.`

export const TOOL_VERIFICATION_NUDGE_COMPACT = `STOP: вызови tool call (read_file/edit_file). Не план текстом.`

export const TOOL_VERIFICATION_FAILED_MESSAGE =
  'Не удалось выполнить действие: модель не вызвала нужные инструменты. Попробуй переформулировать задачу или выбрать другую модель.'

export function pickFakeToolOutputNudge(model: string): string {
  return isCompactPromptModel(model) ? FAKE_TOOL_OUTPUT_NUDGE_COMPACT : FAKE_TOOL_OUTPUT_NUDGE
}

export function pickToolVerificationNudge(model: string): string {
  return isCompactPromptModel(model) ? TOOL_VERIFICATION_NUDGE_COMPACT : TOOL_VERIFICATION_NUDGE
}

export function pickHardToolCallingSystemHint(model: string): string {
  return isCompactPromptModel(model)
    ? HARD_TOOL_CALLING_SYSTEM_HINT_COMPACT
    : HARD_TOOL_CALLING_SYSTEM_HINT
}
