import { Worker } from 'worker_threads'
import { join } from 'path'
import { stat } from 'fs/promises'
import type { GrepMatch } from './fileSearch'

type GrepResult = {
  matches: GrepMatch[]
  truncated: boolean
  filesScanned: number
  skippedLargeFiles: string[]
}
type FindResult = { paths: string[]; truncated: boolean; filesScanned: number }

// LRU-кэш grep: ключ {query, root, subpath}, инвалидация по mtime директории поиска
const GREP_CACHE_MAX = 100
type GrepCacheEntry = { result: GrepResult; mtime: number }
const grepCache = new Map<string, GrepCacheEntry>()

function grepCacheKey(root: string, query: string, subpath?: string): string {
  return `${root}\0${query}\0${subpath ?? ''}`
}

async function grepCacheGet(
  root: string,
  query: string,
  subpath?: string
): Promise<GrepResult | undefined> {
  const key = grepCacheKey(root, query, subpath)
  const entry = grepCache.get(key)
  if (!entry) return undefined
  try {
    const dir = subpath ? join(root, subpath) : root
    const { mtimeMs } = await stat(dir)
    if (mtimeMs !== entry.mtime) {
      grepCache.delete(key)
      return undefined
    }
  } catch {
    grepCache.delete(key)
    return undefined
  }
  // обновляем позицию в LRU
  grepCache.delete(key)
  grepCache.set(key, entry)
  return entry.result
}

async function grepCacheSet(
  root: string,
  query: string,
  subpath: string | undefined,
  result: GrepResult
): Promise<void> {
  try {
    const dir = subpath ? join(root, subpath) : root
    const { mtimeMs } = await stat(dir)
    const key = grepCacheKey(root, query, subpath)
    if (grepCache.size >= GREP_CACHE_MAX) {
      grepCache.delete(grepCache.keys().next().value!)
    }
    grepCache.set(key, { result, mtime: mtimeMs })
  } catch {
    // если не удалось stat — не кэшируем
  }
}

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

export async function grepInTreeWorker(
  root: string,
  query: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<GrepResult> {
  const cached = await grepCacheGet(root, query, options?.subpath)
  if (cached) return cached
  const result = await runWorker<GrepResult>(
    { type: 'grep', root, query, subpath: options?.subpath, maxResults: options?.maxResults },
    options?.onProgress
  )
  await grepCacheSet(root, query, options?.subpath, result)
  return result
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
