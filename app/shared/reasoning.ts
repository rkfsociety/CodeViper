// Модели Ollama с нативным режимом рассуждения (поддерживают параметр think:true).
const THINKING_MODEL_PATTERNS: RegExp[] = [
  /qwen3/i,
  /deepseek-r1/i,
  /\bqwq\b/i,
  /magistral/i,
  /\bthinking\b/i,
  /reasoner/i
]

/** Поддерживает ли модель нативный режим рассуждения (think:true в Ollama). */
export function isThinkingModel(name: string): boolean {
  return THINKING_MODEL_PATTERNS.some((pattern) => pattern.test(name))
}

export const THINKING_LANGUAGE_HINT =
  'Внутренние размышления (thinking) веди на том же языке, что и последнее сообщение пользователя.'

export const DEEP_REASONING_PROMPT = `## Последовательная работа
Сначала разберись в задаче, потом действуй через инструменты. ${THINKING_LANGUAGE_HINT} Не расписывай ход мыслей в основном ответе — выполняй шаги аккуратно и кратко.`
