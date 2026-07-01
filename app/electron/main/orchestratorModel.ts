import { createWriteStream, existsSync } from 'fs'
import { mkdir, rename, unlink } from 'fs/promises'
import { join } from 'path'
import { loadModel, unloadModel } from './nodeLlama'
import { OllamaProvider } from './providers/ollamaProvider'
import type { OrchestratorBackend } from '../../shared/orchestrator'
import {
  ORCHESTRATOR_DEFAULT_GGUF_FILENAME,
  ORCHESTRATOR_DEFAULT_GGUF_URL,
  ORCHESTRATOR_MAX_TOKENS,
  ORCHESTRATOR_TEMPERATURE
} from '../../shared/constants'

// ─── Публичный интерфейс ────────────────────────────────────────────────────

export interface OrchestratorResult {
  /** Краткий пошаговый план выполнения на русском */
  plan: string
  /** @deprecated Не подставляется в запрос агента — только для обратной совместимости парсера */
  rephrased: string
  /** true — задача затрагивает 3+ файла или несколько модулей */
  isComplex: boolean
}

export interface OrchestratorAnalyzeOptions {
  backend: OrchestratorBackend
  ggufPath?: string
  ollamaUrl?: string
  ollamaModel?: string
  signal?: AbortSignal
}

// ─── Промпт ─────────────────────────────────────────────────────────────────

/** Промпт для планировщика: только plan + isComplex (исходный запрос не переписываем). */
export function buildOrchestratorPrompt(message: string): string {
  return (
    'You are a task planner. Respond with ONLY valid JSON, no markdown, no explanation.\n' +
    'Fields (in Russian):\n' +
    '- "plan": numbered steps 1–4, each line = one concrete action (which tool/file/command), NOT a restatement of the task title\n' +
    '- "isComplex": true if task needs 3+ files or multiple modules, false otherwise\n' +
    'Example plan:\n' +
    '1. grep по проекту …\n' +
    '2. read файл …\n' +
    '3. сформировать отчёт …\n\n' +
    `Task: ${message}\n\n` +
    'JSON:'
  )
}

// ─── API ────────────────────────────────────────────────────────────────────

export async function analyzeGguf(message: string, modelPath: string): Promise<OrchestratorResult> {
  const handle = await loadModel(modelPath)
  const raw = await handle.complete(buildOrchestratorPrompt(message), {
    maxTokens: ORCHESTRATOR_MAX_TOKENS,
    temperature: ORCHESTRATOR_TEMPERATURE
  })
  return parseResult(raw)
}

export async function analyzeOllama(
  message: string,
  ollamaUrl: string,
  model: string,
  signal?: AbortSignal
): Promise<OrchestratorResult> {
  const provider = new OllamaProvider(ollamaUrl)
  const prompt = buildOrchestratorPrompt(message)
  let raw = ''
  for await (const chunk of provider.chat({
    model,
    messages: [{ role: 'user', content: prompt }],
    stream: true,
    temperature: ORCHESTRATOR_TEMPERATURE,
    max_tokens: ORCHESTRATOR_MAX_TOKENS,
    signal
  })) {
    raw += chunk.content
    if (chunk.stop_reason) break
  }
  return parseResult(raw)
}

export async function analyze(
  message: string,
  options: OrchestratorAnalyzeOptions | string
): Promise<OrchestratorResult> {
  if (typeof options === 'string') {
    return analyzeGguf(message, options)
  }
  if (options.backend === 'ollama') {
    const url = options.ollamaUrl?.trim() || 'http://127.0.0.1:11434'
    const model = options.ollamaModel?.trim()
    if (!model) throw new Error('Не задана Ollama-модель оркестратора')
    return analyzeOllama(message, url, model, options.signal)
  }
  const path = options.ggufPath?.trim()
  if (!path) throw new Error('Не выбран GGUF-файл оркестратора')
  return analyzeGguf(message, path)
}

/** Выгрузить GGUF-модель оркестратора (например, при смене пути в настройках). */
export async function unloadOrchestratorModel(): Promise<void> {
  await unloadModel()
}

// ─── Скачивание GGUF ────────────────────────────────────────────────────────

export type GgufDownloadProgress = (downloaded: number, total: number) => void

let _dlAbort: AbortController | null = null

/**
 * Скачивает GGUF-модель по умолчанию в `userData/orchestrator/`.
 * Если файл уже существует — возвращает путь сразу (без скачивания).
 * Прогресс передаётся через onProgress(downloadedBytes, totalBytes).
 */
export async function downloadDefaultGguf(
  userDataPath: string,
  onProgress: GgufDownloadProgress
): Promise<string> {
  const dir = join(userDataPath, 'orchestrator')
  await mkdir(dir, { recursive: true })

  const destPath = join(dir, ORCHESTRATOR_DEFAULT_GGUF_FILENAME)
  if (existsSync(destPath)) return destPath

  const partPath = destPath + '.part'

  _dlAbort = new AbortController()
  const writer = createWriteStream(partPath)

  try {
    const response = await fetch(ORCHESTRATOR_DEFAULT_GGUF_URL, {
      signal: _dlAbort.signal,
      redirect: 'follow'
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const total = parseInt(response.headers.get('content-length') ?? '0', 10)
    const body = response.body
    if (!body) throw new Error('Пустое тело ответа')

    let downloaded = 0
    const reader = body.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        writer.write(value)
        downloaded += value.length
        onProgress(downloaded, total)
      }
    } finally {
      reader.releaseLock()
    }

    await new Promise<void>((res, rej) => {
      writer.end()
      writer.on('finish', res)
      writer.on('error', rej)
    })

    await rename(partPath, destPath)
    return destPath
  } catch (e) {
    writer.destroy()
    try {
      await unlink(partPath)
    } catch {
      /* нет файла — ок */
    }
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Скачивание отменено')
    }
    throw e
  } finally {
    _dlAbort = null
  }
}

/** Прервать текущее скачивание GGUF. */
export function cancelGgufDownload(): void {
  _dlAbort?.abort()
  _dlAbort = null
}

// ─── Разбор ответа ──────────────────────────────────────────────────────────

/** Вытаскивает первый `{...}` из текста модели, обходя markdown-обёртки. */
function extractJsonString(text: string): string | null {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  return text.slice(start, end + 1)
}

export function parseOrchestratorResult(raw: string): OrchestratorResult {
  const jsonStr = extractJsonString(raw)
  if (jsonStr) {
    try {
      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      return {
        plan: typeof parsed.plan === 'string' ? parsed.plan : '',
        rephrased: typeof parsed.rephrased === 'string' ? parsed.rephrased : '',
        isComplex: parsed.isComplex === true || parsed.isComplex === 'true'
      }
    } catch {
      // fallthrough
    }
  }
  return {
    plan: '',
    rephrased: raw.trim().slice(0, 300),
    isComplex: false
  }
}

function parseResult(raw: string): OrchestratorResult {
  return parseOrchestratorResult(raw)
}

export {
  shouldAwaitPlanConfirmation,
  shouldGeneratePlanWithAgentModel,
  shouldRunOrchestratorAnalysis
} from '../../shared/orchestrator'
