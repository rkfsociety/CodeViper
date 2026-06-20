import { Worker } from 'worker_threads'
import { join } from 'path'
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

interface PendingRequest {
  resolve: (vec: number[] | null) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, PendingRequest>()
let ready = false
const queue: Array<{ id: number; text: string; ollamaUrl: string }> = []

function flushQueue(): void {
  if (!worker || !ready) return
  while (queue.length > 0) {
    const msg = queue.shift()!
    worker.postMessage(msg)
  }
}

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
        flushQueue()
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
    queue.length = 0
    worker = null
    ready = false
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      for (const req of pending.values())
        req.reject(new Error(`embeddingWorker завершился с кодом ${code}`))
      pending.clear()
    }
    queue.length = 0
    worker = null
    ready = false
  })

  return worker
}

/** Вычислить эмбеддинг через воркер с LRU-кэшем 500 записей. */
export function computeEmbeddingQueued(text: string, ollamaUrl: string): Promise<number[] | null> {
  const cached = embedCacheGet(text)
  if (cached) return Promise.resolve(cached)

  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, {
      resolve: (vec) => {
        if (vec) embedCacheSet(text, vec)
        resolve(vec)
      },
      reject
    })
    const msg = { id, type: 'compute' as const, text, ollamaUrl }
    if (ready) {
      getWorker().postMessage(msg)
    } else {
      queue.push(msg)
      getWorker() // гарантируем, что воркер создан
    }
  })
}
