import { Worker } from 'worker_threads'
import { join } from 'path'
import type { GrepMatch } from './fileSearch'

type GrepResult = {
  matches: GrepMatch[]
  truncated: boolean
  filesScanned: number
  skippedLargeFiles: string[]
}
type FindResult = { paths: string[]; truncated: boolean; filesScanned: number }

function runWorker<T>(req: object, onProgress?: (scanned: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const workerPath = join(__dirname, 'fileSearchWorker.js')
    const worker = new Worker(workerPath, { workerData: req })

    worker.on('message', (msg: { type: string; scanned?: number; data?: T; message?: string }) => {
      if (msg.type === 'progress') {
        onProgress?.(msg.scanned!)
      } else if (msg.type === 'result') {
        resolve(msg.data as T)
      } else if (msg.type === 'error') {
        reject(new Error(msg.message))
      }
    })

    worker.on('error', reject)
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`fileSearchWorker завершился с кодом ${code}`))
    })
  })
}

export function grepInTreeWorker(
  root: string,
  query: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<GrepResult> {
  return runWorker<GrepResult>(
    { type: 'grep', root, query, subpath: options?.subpath, maxResults: options?.maxResults },
    options?.onProgress
  )
}

export function findFilesInTreeWorker(
  root: string,
  pattern: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<FindResult> {
  return runWorker<FindResult>(
    { type: 'find', root, pattern, subpath: options?.subpath, maxResults: options?.maxResults },
    options?.onProgress
  )
}
