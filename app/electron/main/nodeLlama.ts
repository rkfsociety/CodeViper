import { existsSync } from 'fs'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Публичный интерфейс ────────────────────────────────────────────────────

export interface NodeLlamaCompletionOptions {
  maxTokens?: number
  temperature?: number
}

export interface NodeLlamaHandle {
  readonly modelPath: string
  complete(prompt: string, options?: NodeLlamaCompletionOptions): Promise<string>
  unload(): Promise<void>
}

// ─── Синглтон ───────────────────────────────────────────────────────────────

// Переменная-не-литерал: TypeScript не резолвит модуль статически → typecheck
// проходит даже без установленного пакета; Vite-ignore — не бандлить в renderer.
const LLAMA_MOD: string = 'node-llama-cpp'

/** Ленивая загрузка нативного модуля */
async function requireLlamaMod(): Promise<any> {
  try {
    return await import(/* @vite-ignore */ LLAMA_MOD)
  } catch {
    throw new Error('node-llama-cpp не установлен. Выполните: npm install && npm run rebuild')
  }
}

// Состояние синглтона
let _handle: NodeLlamaHandle | null = null
let _lib: any = null
let _llama: any = null
let _model: any = null
let _ctx: any = null

// ─── API ────────────────────────────────────────────────────────────────────

/**
 * Загрузить GGUF-модель. Если модель уже загружена и путь совпадает —
 * возвращает кешированный handle. Если путь отличается — выгружает старую.
 */
export async function loadModel(modelPath: string): Promise<NodeLlamaHandle> {
  if (_handle && _handle.modelPath === modelPath) return _handle

  // Выгрузить предыдущую модель
  if (_handle) await unloadModel()

  if (!existsSync(modelPath)) {
    throw new Error(`GGUF-файл не найден: ${modelPath}`)
  }

  _lib = await requireLlamaMod()
  _llama = await _lib.getLlama()
  _model = await _llama.loadModel({ modelPath })
  _ctx = await _model.createContext()

  _handle = {
    modelPath,

    async complete(prompt: string, options: NodeLlamaCompletionOptions = {}): Promise<string> {
      if (!_ctx || !_lib) throw new Error('Контекст не инициализирован')

      const { LlamaChatSession } = _lib
      // Каждый вызов — новая сессия (чистая история)
      const session = new LlamaChatSession({ contextSequence: _ctx.getSequence() })
      const result: string = await session.prompt(prompt, {
        maxTokens: options.maxTokens,
        temperature: options.temperature
      })
      return result
    },

    async unload(): Promise<void> {
      await _cleanup()
    }
  }

  return _handle
}

/**
 * Одиночный вызов модели без явной загрузки.
 * Бросает, если модель не загружена через loadModel().
 */
export async function complete(
  prompt: string,
  options?: NodeLlamaCompletionOptions
): Promise<string> {
  if (!_handle) {
    throw new Error('Модель не загружена. Сначала вызовите loadModel(path).')
  }
  return _handle.complete(prompt, options)
}

/** Выгрузить модель и освободить память. */
export async function unloadModel(): Promise<void> {
  await _cleanup()
}

/** Текущий handle или null, если модель не загружена. */
export function getHandle(): NodeLlamaHandle | null {
  return _handle
}

// ─── Внутреннее ─────────────────────────────────────────────────────────────

async function _cleanup(): Promise<void> {
  const errors: string[] = []

  if (_ctx) {
    try {
      await _ctx.dispose()
    } catch (e) {
      errors.push(`ctx.dispose: ${e instanceof Error ? e.message : String(e)}`)
    }
    _ctx = null
  }

  if (_model) {
    try {
      await _model.dispose()
    } catch (e) {
      errors.push(`model.dispose: ${e instanceof Error ? e.message : String(e)}`)
    }
    _model = null
  }

  _llama = null
  _lib = null
  _handle = null

  if (errors.length > 0) {
    throw new Error(`Ошибки при выгрузке модели: ${errors.join('; ')}`)
  }
}
