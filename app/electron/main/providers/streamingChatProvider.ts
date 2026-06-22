import type { ChatOptions, ChatChunk } from '../../../shared/modelProvider'

/** Минимальный набор полей fetch() init, нужный базовому классу. Signal добавляется отдельно. */
export interface FetchInit {
  method: string
  headers?: Record<string, string>
  body?: string
}

/**
 * Парсер чанков для одного вызова chat().
 * Создаётся через createChunkParser() — может содержать состояние (накопитель tool_calls и т.д.).
 */
export interface ChunkParser {
  /** Разобрать одну строку стрима. Вернуть null чтобы пропустить строку. */
  parse(line: string): ChatChunk | null
  /** Вызывается после конца стрима — выдаёт оставшиеся чанки (например финальный tool_calls). */
  finalize(): ChatChunk[]
}

/**
 * Абстрактный базовый класс для провайдеров с HTTP-стримингом (NDJSON / SSE).
 *
 * Конкретный провайдер реализует только:
 *   - buildRequest() — URL и RequestInit (без signal — базовый класс добавляет его)
 *   - createChunkParser() — фабрика парсера с локальным состоянием на один chat()-вызов
 *   - handleHttpError() — трансляция HTTP-ошибки в понятное сообщение (опционально)
 *
 * Базовый класс берёт на себя:
 *   - Retry с exponential backoff при HTTP 429 (управляется BACKOFF_MS в подклассе)
 *   - Получение reader, TextDecoder, буферизацию, разбивку по строкам, releaseLock
 */
export abstract class StreamingChatProvider {
  /** Задержки (мс) для повторных попыток при HTTP 429. [] = без повторов. */
  protected readonly BACKOFF_MS: number[] = []

  /** Сформировать URL и параметры запроса. Signal добавляется базовым классом отдельно. */
  protected abstract buildRequest(options: ChatOptions): { url: string; init: FetchInit }

  /** Создать парсер чанков. Вызывается один раз перед стримом — может закрывать состояние. */
  protected abstract createChunkParser(options: ChatOptions): ChunkParser

  /** Обработать не-2xx ответ. Должен всегда бросать исключение. */
  protected handleHttpError(status: number, body: string): never {
    throw new Error(`HTTP error ${status}: ${body}`)
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const { url, init } = this.buildRequest(options)

    const doFetch = () => fetch(url, { ...init, signal: options.signal })
    let res = await doFetch()

    for (let attempt = 0; res.status === 429 && attempt < this.BACKOFF_MS.length; attempt++) {
      const jitter = Math.floor(Math.random() * 200)
      const waitMs = this.BACKOFF_MS[attempt]! + jitter
      options.onRetry429?.(waitMs, attempt + 1)
      await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
      res = await doFetch()
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      this.handleHttpError(res.status, body)
    }

    const reader = res.body?.getReader()
    if (!reader) throw new Error('No response body')

    const parser = this.createChunkParser(options)
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.trim()) continue
          const chunk = parser.parse(line)
          if (chunk !== null) yield chunk
        }
      }

      if (buffer.trim()) {
        const chunk = parser.parse(buffer)
        if (chunk !== null) yield chunk
      }

      for (const chunk of parser.finalize()) {
        yield chunk
      }
    } finally {
      reader.releaseLock()
    }
  }
}
