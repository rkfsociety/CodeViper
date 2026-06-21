import { Worker } from 'worker_threads'
import { join } from 'path'
import { stat } from 'fs/promises'
import type { GrepMatch } from './fileSearch'
import { MAX_GREP_RESULTS } from './fileSearch'

type GrepResult = {
  matches: GrepMatch[]
  truncated: boolean
  filesScanned: number
  skippedLargeFiles: string[]
}
type FindResult = { paths: string[]; truncated: boolean; filesScanned: number }

// LRU-кэш grep: ключ {query, root, subpath}, 500 записей.
// Инвалидация: либо явный вызов invalidateGrepCache() из вотчера services.ts,
// либо fallback по mtime директории при отсутствии вотчера.
const GREP_CACHE_MAX = 500
type GrepCacheEntry = { result: GrepResult; mtime: number }
const grepCache = new Map<string, GrepCacheEntry>()

function grepCacheKey(root: string, query: string, subpath?: string): string {
  return `${root}\0${query}\0${subpath ?? ''}`
}

/** Инвалидировать все записи кэша для проекта root (или subpath внутри него). */
export function invalidateGrepCache(root: string, subpath?: string): void {
  const prefix = subpath ? `${root}\0` : root
  for (const key of grepCache.keys()) {
    if (key.startsWith(prefix)) grepCache.delete(key)
  }
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

// ─── Батчинг параллельных grep-вызовов ───────────────────────────────────────

const BATCH_MAX = 5

type PendingGrep = {
  root: string
  subpath: string | undefined
  query: string
  maxResults: number
  onProgress?: (scanned: number) => void
  resolve: (result: GrepResult) => void
  reject: (err: unknown) => void
}

const pendingGreps: PendingGrep[] = []
let batchScheduled = false

function scheduleBatch(): void {
  if (batchScheduled) return
  batchScheduled = true
  Promise.resolve().then(flushBatch)
}

async function flushBatch(): Promise<void> {
  batchScheduled = false
  const batch = pendingGreps.splice(0)
  if (!batch.length) return

  // Группируем по root+subpath — только они могут объединить обход в одну операцию
  const groups = new Map<string, PendingGrep[]>()
  for (const item of batch) {
    const key = `${item.root}\0${item.subpath ?? ''}`
    const g = groups.get(key)
    if (g) g.push(item)
    else groups.set(key, [item])
  }

  const tasks: Promise<void>[] = []

  for (const group of groups.values()) {
    // Делим группу на чанки по BATCH_MAX
    for (let i = 0; i < group.length; i += BATCH_MAX) {
      const chunk = group.slice(i, i + BATCH_MAX)
      tasks.push(dispatchChunk(chunk))
    }
  }

  await Promise.all(tasks)
}

async function dispatchChunk(chunk: PendingGrep[]): Promise<void> {
  // Проверяем кэш для каждого запроса
  const cached = await Promise.all(
    chunk.map((item) => grepCacheGet(item.root, item.query, item.subpath))
  )

  const uncachedIdx = chunk.map((_, i) => i).filter((i) => !cached[i])

  // Все в кэше
  if (!uncachedIdx.length) {
    chunk.forEach((item, i) => item.resolve(cached[i]!))
    return
  }

  // Один запрос без кэша — запускаем обычный воркер (одиночный)
  if (uncachedIdx.length === 1) {
    const idx = uncachedIdx[0]
    const item = chunk[idx]
    try {
      const result = await runWorker<GrepResult>(
        {
          type: 'grep',
          root: item.root,
          query: item.query,
          subpath: item.subpath,
          maxResults: item.maxResults
        },
        item.onProgress
      )
      await grepCacheSet(item.root, item.query, item.subpath, result)
      chunk.forEach((c, i) => (i === idx ? c.resolve(result) : c.resolve(cached[i]!)))
    } catch (err) {
      chunk.forEach((c, i) => (i === idx ? c.reject(err) : c.resolve(cached[i]!)))
    }
    return
  }

  // Несколько запросов без кэша — объединяем в один multi-grep воркер
  const uncached = uncachedIdx.map((i) => chunk[i])
  const onProgress = uncached.find((item) => item.onProgress)?.onProgress

  try {
    const results = await runWorker<GrepResult[]>(
      {
        type: 'multi-grep',
        root: uncached[0].root,
        queries: uncached.map((item) => item.query),
        maxResultsPerQuery: uncached.map((item) => item.maxResults),
        subpath: uncached[0].subpath
      },
      onProgress
    )

    // Кэшируем и резолвим некэшированные
    await Promise.all(
      uncached.map((item, j) => grepCacheSet(item.root, item.query, item.subpath, results[j]))
    )
    uncached.forEach((item, j) => item.resolve(results[j]))

    // Резолвим закэшированные
    chunk.forEach((item, i) => {
      if (cached[i]) item.resolve(cached[i]!)
    })
  } catch (err) {
    uncached.forEach((item) => item.reject(err))
    chunk.forEach((item, i) => {
      if (cached[i]) item.resolve(cached[i]!)
    })
  }
}

// ─── LRU-кэш find_files: ключ {pattern, root}, инвалидация по mtime root ─────

const FIND_CACHE_MAX = 200
type FindCacheEntry = { result: FindResult; mtime: number }
const findCache = new Map<string, FindCacheEntry>()

function findCacheKey(root: string, pattern: string, subpath?: string): string {
  return `${root}\0${pattern}\0${subpath ?? ''}`
}

async function findCacheGet(
  root: string,
  pattern: string,
  subpath?: string
): Promise<FindResult | undefined> {
  const key = findCacheKey(root, pattern, subpath)
  const entry = findCache.get(key)
  if (!entry) return undefined
  try {
    const dir = subpath ? join(root, subpath) : root
    const { mtimeMs } = await stat(dir)
    if (mtimeMs !== entry.mtime) {
      findCache.delete(key)
      return undefined
    }
  } catch {
    findCache.delete(key)
    return undefined
  }
  // обновляем позицию в LRU
  findCache.delete(key)
  findCache.set(key, entry)
  return entry.result
}

async function findCacheSet(
  root: string,
  pattern: string,
  subpath: string | undefined,
  result: FindResult
): Promise<void> {
  try {
    const dir = subpath ? join(root, subpath) : root
    const { mtimeMs } = await stat(dir)
    const key = findCacheKey(root, pattern, subpath)
    if (findCache.size >= FIND_CACHE_MAX) {
      findCache.delete(findCache.keys().next().value!)
    }
    findCache.set(key, { result, mtime: mtimeMs })
  } catch {
    // если не удалось stat — не кэшируем
  }
}

// ─── Публичный API ────────────────────────────────────────────────────────────

export function grepInTreeWorker(
  root: string,
  query: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<GrepResult> {
  return new Promise((resolve, reject) => {
    pendingGreps.push({
      root,
      subpath: options?.subpath,
      query,
      maxResults: options?.maxResults ?? MAX_GREP_RESULTS,
      onProgress: options?.onProgress,
      resolve,
      reject
    })
    scheduleBatch()
  })
}

export async function findFilesInTreeWorker(
  root: string,
  pattern: string,
  options?: { subpath?: string; maxResults?: number; onProgress?: (scanned: number) => void }
): Promise<FindResult> {
  const cached = await findCacheGet(root, pattern, options?.subpath)
  if (cached) return cached

  const result = await runWorker<FindResult>(
    { type: 'find', root, pattern, subpath: options?.subpath, maxResults: options?.maxResults },
    options?.onProgress
  )
  await findCacheSet(root, pattern, options?.subpath, result)
  return result
}
