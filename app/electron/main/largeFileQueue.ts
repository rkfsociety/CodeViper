import { Worker } from 'worker_threads'
import { join } from 'path'

interface PendingRequest {
  resolve: (content: string) => void
  reject: (err: Error) => void
}

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, PendingRequest>()

function getWorker(): Worker {
  if (worker) return worker

  worker = new Worker(join(__dirname, 'largeFileWorker.js'))

  worker.on(
    'message',
    (
      msg:
        | { id: number; type: 'result'; content: string }
        | { id: number; type: 'error'; message: string }
    ) => {
      const req = pending.get(msg.id)
      if (!req) return
      pending.delete(msg.id)
      if (msg.type === 'result') {
        req.resolve(msg.content)
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
        req.reject(new Error(`largeFileWorker завершился с кодом ${code}`))
      pending.clear()
    }
    worker = null
  })

  return worker
}

/** Читать и разбить на строки большой файл в worker_thread. */
export function readLargeFileQueued(
  filePath: string,
  offset: number,
  limit: number | null,
  defaultLimit: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++
    pending.set(id, { resolve, reject })
    getWorker().postMessage({ id, type: 'read', filePath, offset, limit, defaultLimit })
  })
}

export function shutdownLargeFileWorker(): void {
  if (!worker) return
  void worker.terminate()
  worker = null
  pending.clear()
}
