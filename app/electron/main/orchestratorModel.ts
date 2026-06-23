import { loadModel, unloadModel } from './nodeLlama'
import { ORCHESTRATOR_MAX_TOKENS, ORCHESTRATOR_TEMPERATURE } from '../../shared/constants'

// ─── Публичный интерфейс ────────────────────────────────────────────────────

export interface OrchestratorResult {
  /** Краткий пошаговый план выполнения на русском */
  plan: string
  /** Переформулированная, более чёткая версия исходного запроса */
  rephrased: string
  /** true — задача затрагивает 3+ файла или несколько модулей */
  isComplex: boolean
}

// ─── Промпт ─────────────────────────────────────────────────────────────────

// Промпт для малых GGUF-моделей (1.5B–7B): краткая инструкция + пример формата
// на одной строке, чтобы модели с коротким контекстом надёжно выдавали JSON.
function buildPrompt(message: string): string {
  return (
    'You are a task planner. Respond with ONLY valid JSON, no markdown, no explanation.\n' +
    'Fields (all in Russian): "plan" = brief 2-4 step plan, "rephrased" = clearer task statement,\n' +
    '"isComplex" = true if task needs 3+ files or multiple modules, false otherwise.\n\n' +
    `Task: ${message}\n\n` +
    'JSON:'
  )
}

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Анализирует сообщение пользователя через локальную GGUF-модель.
 * Загружает модель (синглтон nodeLlama) и возвращает структурированный результат.
 */
export async function analyze(message: string, modelPath: string): Promise<OrchestratorResult> {
  const handle = await loadModel(modelPath)
  const raw = await handle.complete(buildPrompt(message), {
    maxTokens: ORCHESTRATOR_MAX_TOKENS,
    temperature: ORCHESTRATOR_TEMPERATURE
  })
  return parseResult(raw)
}

/** Выгрузить GGUF-модель оркестратора (например, при смене пути в настройках). */
export async function unloadOrchestratorModel(): Promise<void> {
  await unloadModel()
}

// ─── Разбор ответа ──────────────────────────────────────────────────────────

/** Вытаскивает первый `{...}` из текста модели, обходя markdown-обёртки. */
function extractJsonString(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}

function parseResult(raw: string): OrchestratorResult {
  const jsonStr = extractJsonString(raw)
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      return {
        plan: typeof parsed.plan === 'string' ? parsed.plan : '',
        rephrased: typeof parsed.rephrased === 'string' ? parsed.rephrased : '',
        // Модели иногда возвращают строку "true"/"false" — приводим явно
        isComplex: parsed.isComplex === true || parsed.isComplex === 'true'
      }
    } catch {
      // fallthrough
    }
  }
  // Fallback: пустой план, исходный текст как rephrased, задача считается простой
  return {
    plan: '',
    rephrased: raw.trim().slice(0, 300),
    isComplex: false
  }
}
