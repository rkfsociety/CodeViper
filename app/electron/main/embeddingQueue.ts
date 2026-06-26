import { Worker } from 'worker_threads'
import { join } from 'path'
import { PROJECT_INDEX_DEBOUNCE_MS } from '../../shared/constants'
import { EMBED_MODEL } from './embeddings'

// LRU-кэш эмбеддингов: text → vector
const EMBED_CACHE_MAX = 500
const embedCache = new Map<string, number[]>()

function embedCacheGet(text: string): number[] | undefined {
  const vec = embedCache.get(text)
  if (vec !== undefined) {
    embedCache.delete(text)
    embedCache.set(text, vec)
  }
  return vec
}

function embedCacheSet(text: string, vec: number[]): void {
  if (embedCache.size >= EMBED_CACHE_MAX) {
    embedCache.delete(embedCache.keys().next().value!)
  }
  embedCache.set(text, vec)
}

// ── Внутренние типы ───────────────────────────────────────────────────────────

interface PendingRequest {
  resolve: (vec: number[] | null) => void
  reject: (err: Error) => void
}

interface QueueItem {
  text: string
  ollamaUrl: string
  resolve: (vec: number[] | null) => void
  reject: (err: Error) => void
}

// ── Состояние воркера ─────────────────────────────────────────────────────────

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, PendingRequest>()
let ready = false

// Очередь ожидающих запросов (до отправки в воркер)
const waitQueue: QueueItem[] = []
// Флаг: батч-цикл сейчас работает
let draining = false

const BATCH_SIZE = 4

// ── Батч-дренаж ───────────────────────────────────────────────────────────────

/** Запланировать дренаж в текущем тике (микротаск). */
function scheduleFlush(): void {
  if (draining) return
  void Promise.resolve().then(() => flush())
}

/**
 * Дренирует waitQueue батчами по BATCH_SIZE.
 * Каждый батч отправляется в воркер и ожидается через Promise.all.
 * Следующий батч стартует только после полного завершения предыдущего.
 */
async function flush(): Promise<void> {
  if (draining || !ready || !worker) return
  draining = true
  try {
    while (waitQueue.length > 0 && ready && worker) {
      const batch = waitQueue.splice(0, BATCH_SIZE)
      await Promise.all(batch.map((item) => dispatchOne(item)))
    }
  } finally {
    draining = false
    // Если новые запросы пришли пока дренировали — запускаем ещё раз
    if (waitQueue.length > 0 && ready) scheduleFlush()
  }
}

/** Отправить один запрос в воркер и вернуть Promise, который резолвится когда воркер ответит. */
function dispatchOne(item: QueueItem): Promise<void> {
  return new Promise<void>((done) => {
    const id = nextId++
    pending.set(id, {
      resolve: (vec) => {
        if (vec !== null) embedCacheSet(item.text, vec)
        item.resolve(vec)
        done()
      },
      reject: (err) => {
        item.reject(err)
        done()
      }
    })
    worker!.postMessage({
      id,
      type: 'compute' as const,
      text: item.text,
      ollamaUrl: item.ollamaUrl
    })
  })
}

// ── Управление воркером ───────────────────────────────────────────────────────

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(join(__dirname, 'embeddingWorker.js'), {
    workerData: { model: EMBED_MODEL }
  })

  worker.on(
    'message',
    (
      msg:
        | { id: number; type: 'result'; vec: number[] | null }
        | { id: number; type: 'error'; message: string }
        | { type: 'ready' }
    ) => {
      if (msg.type === 'ready') {
        ready = true
        scheduleFlush()
        return
      }
      const req = pending.get(msg.id)
      if (!req) return
      pending.delete(msg.id)
      if (msg.type === 'result') {
        req.resolve(msg.vec)
      } else {
        req.reject(new Error(msg.message))
      }
    }
  )

  worker.on('error', (err) => {
    for (const req of pending.values()) req.reject(err)
    pending.clear()
    // Отклоняем запросы, ещё не отправленные в воркер
    const stuck = waitQueue.splice(0)
    for (const item of stuck) item.reject(err)
    draining = false
    worker = null
    ready = false
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      const exitErr = new Error(`embeddingWorker завершился с кодом ${code}`)
      for (const req of pending.values()) req.reject(exitErr)
      pending.clear()
      const stuck = waitQueue.splice(0)
      for (const item of stuck) item.reject(exitErr)
    }
    draining = false
    worker = null
    ready = false
  })

  return worker
}

// ── Публичный API ─────────────────────────────────────────────────────────────

/** Вычислить эмбеддинг через воркер с LRU-кэшем 500 записей.
 *  Запросы группируются в батчи до 4 штук и отправляются в воркер через Promise.all. */
export function computeEmbeddingQueued(text: string, ollamaUrl: string): Promise<number[] | null> {
  const cached = embedCacheGet(text)
  if (cached) return Promise.resolve(cached)

  getWorker() // гарантируем, что воркер создан

  return new Promise((resolve, reject) => {
    waitQueue.push({ text, ollamaUrl, resolve, reject })
    scheduleFlush()
  })
}

/** Cosine similarity двух векторов (0…1). */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Максимальная cosine similarity между text и списком otherTexts.
 * null — если эмбеддинг text не удалось вычислить.
 */
export async function maxSemanticSimilarity(
  text: string,
  otherTexts: string[],
  ollamaUrl: string
): Promise<number | null> {
  const vec = await computeEmbeddingQueued(text, ollamaUrl)
  if (!vec) return null

  let max = 0
  for (const other of otherTexts) {
    const otherVec = await computeEmbeddingQueued(other, ollamaUrl)
    if (!otherVec) continue
    max = Math.max(max, cosineSimilarity(vec, otherVec))
  }
  return max
}

/** Завершить воркер перед установкой обновления — иначе NSIS видит «процесс ещё работает». */
export function shutdownEmbeddingWorker(): void {
  if (!worker) return
  void worker.terminate()
  worker = null
  ready = false
  pending.clear()
  waitQueue.splice(0)
  draining = false
}

// ── Инкрементальная индексация файлов (debounce) ─────────────────────────────

const incrementalIndexTimers = new Map<string, ReturnType<typeof setTimeout>>()

/** Debounce-очередь для переиндексации одного файла (ключ — projectPath + absPath). */
export function scheduleIncrementalProjectIndex(
  key: string,
  run: () => void | Promise<void>,
  debounceMs = PROJECT_INDEX_DEBOUNCE_MS
): void {
  const prev = incrementalIndexTimers.get(key)
  if (prev) clearTimeout(prev)
  incrementalIndexTimers.set(
    key,
    setTimeout(() => {
      incrementalIndexTimers.delete(key)
      void Promise.resolve(run()).catch(() => {})
    }, debounceMs)
  )
}

/** Сброс таймеров (тесты). */
export function clearIncrementalProjectIndexTimers(): void {
  for (const timer of incrementalIndexTimers.values()) clearTimeout(timer)
  incrementalIndexTimers.clear()
}
