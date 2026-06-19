import { Worker } from 'worker_threads'
import { join } from 'path'
import { EMBED_MODEL } from './embeddings'

interface PendingRequest {
  resolve: (vec: number[] | null) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, PendingRequest>()

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
    ) => {
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
    worker = null
  })

  worker.on('exit', (code) => {
    if (code !== 0) {
      for (const req of pending.values())
        req.reject(new Error(`embeddingWorker завершился с кодом ${code}`))
      pending.clear()
    }
    worker = null
  })

  return worker
}

/** Вычислить эмбеддинг через воркер (с LRU-кешем 500 записей). */
export function computeEmbeddingQueued(text: string, ollamaUrl: string): Promise<number[] | null> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'compute', text, ollamaUrl })
  })
}
