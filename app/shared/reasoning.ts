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

export const DEEP_REASONING_PROMPT = `## Режим глубокого рассуждения
Перед действиями рассуждай пошагово: разбери задачу на части, оцени варианты и краевые случаи, проверь предположения — и только затем действуй через инструменты. Будь тщательнее обычного: перепроверяй результаты инструментов и не спеши с выводами. Финальный ответ давай кратко и по делу.`
