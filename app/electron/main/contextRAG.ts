import { createHash } from 'crypto'
import { readFile, readdir } from 'fs/promises'
import { extname, join, relative } from 'path'
import { QdrantClient } from '@qdrant/js-client-rest'
import type { OllamaMessage } from './agentContext'
import { computeEmbedding } from './embeddings'
import { createVectorStore, LocalVectorStore } from './vectorStore'
import type { VectorStoreConfig } from './vectorStore'
import { emitProgress, clearProgress } from './progress'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'

export const CONTEXT_RAG_INDEX = 'contextRAG.json'

export interface RAGSearchResult {
  message: OllamaMessage
  id: string
  score: number
}

/**
 * Добавить сообщение в RAG индекс.
 * Автоматически вычисляет эмбеддинг и сохраняет через выбранный VectorStore.
 */
export async function addMessageToRAG(
  id: string,
  message: OllamaMessage,
  chatId: string,
  ollamaUrl: string,
  storeConfig: VectorStoreConfig = { provider: 'local' }
): Promise<void> {
  if (message.role === 'system') return

  const embedding = await computeEmbedding(message.content, ollamaUrl)
  if (!embedding) return

  const store = createVectorStore(storeConfig)
  await store.upsert({
    id,
    role: message.role as 'user' | 'assistant' | 'tool',
    content: message.content,
    embedding,
    chatId,
    timestamp: Date.now()
  })

  // Удаляем устаревшие сообщения (> 30 дней) только для локального хранилища
  if (storeConfig.provider === 'local') {
    await store.pruneOld(30).catch(() => {})
  }
}

/**
 * Удалить сообщение из RAG индекса.
 */
export async function removeMessageFromRAG(
  id: string,
  storeConfig: VectorStoreConfig = { provider: 'local' }
): Promise<void> {
  const store = createVectorStore(storeConfig)
  await store.delete(id)
}

/**
 * Поиск релевантных сообщений по семантике.
 * Возвращает top-N сообщений, отсортированных по убыванию score.
 */
export async function searchRAGMessages(
  query: string,
  chatId: string,
  ollamaUrl: string,
  limit = 15,
  minScore = 0.3,
  storeConfig: VectorStoreConfig = { provider: 'local' }
): Promise<RAGSearchResult[]> {
  const queryEmbedding = await computeEmbedding(query, ollamaUrl)
  if (!queryEmbedding) return []

  const store = createVectorStore(storeConfig)
  const hits = await store.search(queryEmbedding, chatId, limit, minScore)

  return hits.map((h) => ({
    id: h.id,
    score: h.score,
    message: { role: h.role, content: h.content }
  }))
}

/**
 * Получить последние N сообщений из RAG индекса для конкретного чата.
 * Используется как fallback когда поиск не релевантен.
 * Работает только для локального хранилища; для внешних — возвращает [].
 */
export async function getRecentRAGMessages(
  chatId: string,
  storeConfig: VectorStoreConfig = { provider: 'local' },
  limit = 10
): Promise<RAGSearchResult[]> {
  if (storeConfig.provider !== 'local') return []

  const store = new LocalVectorStore(storeConfig.projectPath)
  // Получаем все сообщения чата через поиск с нулевым вектором — нет прямого API получить все
  // Используем внутренний обходной путь через LocalVectorStore
  const zeroVec = new Array<number>(768).fill(0)
  const hits = await store.search(zeroVec, chatId, limit, -Infinity)

  // Сортируем по времени (свежие последние)
  hits.sort((a, b) => a.timestamp - b.timestamp)

  return hits.map((h) => ({
    id: h.id,
    score: 0,
    message: { role: h.role, content: h.content }
  }))
}

export const PROJECT_RAG_COLLECTION = 'codeviper_project'
const AUTO_INDEX_COLLECTION = PROJECT_RAG_COLLECTION
const AUTO_INDEX_CHUNK_LINES = 500
const AUTO_INDEX_TEXT_EXTS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.json',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.md',
  '.txt',
  '.sh',
  '.bat',
  '.cmd',
  '.html',
  '.css',
  '.scss',
  '.less',
  '.vue',
  '.svelte',
  '.sql',
  '.graphql',
  '.gql'
])
const AUTO_INDEX_SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'release',
  'dist-electron',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  '.vitest-tmp'
])

/**
 * Фоновая индексация файлов проекта в Qdrant.
 * Запускается при открытии проекта (autoIndexOnOpen = true).
 * Прогресс отправляется через emitProgress / clearProgress.
 */
export async function runProjectAutoIndex(
  projectPath: string,
  ollamaUrl: string,
  qdrantUrl: string,
  qdrantApiKey?: string
): Promise<void> {
  const client = new QdrantClient({
    url: qdrantUrl,
    ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {})
  })

  try {
    const cols = await client.getCollections()
    const exists = cols.collections.some((c) => c.name === AUTO_INDEX_COLLECTION)
    if (!exists) {
      await client.createCollection(AUTO_INDEX_COLLECTION, {
        vectors: { size: 768, distance: 'Cosine' }
      })
    }
  } catch {
    clearProgress()
    return
  }

  const files: string[] = []

  async function walkDir(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.codeviper') continue
      if (AUTO_INDEX_SKIP_DIRS.has(entry.name)) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkDir(full)
      } else if (entry.isFile() && AUTO_INDEX_TEXT_EXTS.has(extname(entry.name).toLowerCase())) {
        files.push(full)
      }
    }
  }

  emitProgress('Индексация: сканирование…', 0)
  await walkDir(projectPath)

  for (let fi = 0; fi < files.length; fi++) {
    const absPath = files[fi]
    const relPath = relative(projectPath, absPath)
    const pct = Math.round(((fi + 1) / files.length) * 100)
    emitProgress(`Индексация: ${relPath}`, pct)

    let buf: Buffer
    try {
      buf = await readFile(absPath)
    } catch {
      continue
    }
    if (buf.includes(0) || buf.length > FILE_SIZE_LIMIT_BYTES) continue

    const lines = buf.toString('utf-8').split('\n')
    const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = []

    for (let ci = 0; ci * AUTO_INDEX_CHUNK_LINES < lines.length; ci++) {
      const chunkText = `File: ${relPath}\n\n${lines.slice(ci * AUTO_INDEX_CHUNK_LINES, (ci + 1) * AUTO_INDEX_CHUNK_LINES).join('\n')}`
      const vec = await computeEmbedding(chunkText, ollamaUrl)
      if (!vec) continue

      const hex = createHash('md5').update(`${relPath}:${ci}`).digest('hex')
      const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
      points.push({ id, vector: vec, payload: { filePath: relPath, chunkIndex: ci, projectPath } })
    }

    if (points.length > 0) {
      await client.upsert(AUTO_INDEX_COLLECTION, { points, wait: false }).catch(() => {})
    }
  }

  clearProgress()
}

/**
 * Очистить все RAG данные для конкретного чата.
 * Используется при удалении чата.
 */
export async function clearChatFromRAG(
  chatId: string,
  storeConfig: VectorStoreConfig = { provider: 'local' }
): Promise<void> {
  const store = createVectorStore(storeConfig)
  await store.clearChat(chatId)
}
