import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { OllamaMessage } from './agentContext'
import { computeEmbedding } from './embeddings'

export const CONTEXT_RAG_INDEX = 'contextRAG.json'

/**
 * Структура одного сообщения в RAG индексе:
 * - id: уникальный идентификатор (timestamp + uuid)
 * - role, content: из OllamaMessage
 * - embedding: вектор (768 для nomic-embed-text)
 * - chatId: для фильтрации по чату
 * - timestamp: для сортировки по времени
 * - score: оценка релевантности (вычисляется при поиске)
 */
export interface RAGMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  embedding: number[]
  chatId: string
  timestamp: number
}

interface RAGIndex {
  version: number
  messages: RAGMessage[]
  lastUpdated: number
}

function globalRAGIndexPath(): string {
  return join(app.getPath('userData'), CONTEXT_RAG_INDEX)
}

function projectRAGIndexPath(projectPath: string): string {
  return join(projectPath, '.codeviper', CONTEXT_RAG_INDEX)
}

function emptyIndex(): RAGIndex {
  return { version: 1, messages: [], lastUpdated: Date.now() }
}

async function loadIndex(path: string): Promise<RAGIndex> {
  if (!existsSync(path)) return emptyIndex()
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as RAGIndex
    if (!Array.isArray(parsed.messages)) return emptyIndex()
    return parsed
  } catch {
    return emptyIndex()
  }
}

async function saveIndex(path: string, index: RAGIndex): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  index.lastUpdated = Date.now()
  await writeFile(path, JSON.stringify(index), 'utf-8')
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Добавить сообщение в RAG индекс.
 * Автоматически вычисляет эмбеддинг и сохраняет в глобальный или проектный индекс.
 */
export async function addMessageToRAG(
  id: string,
  message: OllamaMessage,
  chatId: string,
  projectPath: string,
  ollamaUrl: string,
  useProjectScope = false
): Promise<void> {
  // Не индексируем служебные сообщения
  if (message.role === 'system') return

  const embedding = await computeEmbedding(message.content, ollamaUrl)
  if (!embedding) return

  const ragMessage: RAGMessage = {
    id,
    role: message.role as 'user' | 'assistant' | 'tool',
    content: message.content,
    embedding,
    chatId,
    timestamp: Date.now()
  }

  const path =
    useProjectScope && projectPath ? projectRAGIndexPath(projectPath) : globalRAGIndexPath()

  const index = await loadIndex(path)
  // Заменяем если уже есть такой ID
  index.messages = index.messages.filter((m) => m.id !== id)
  index.messages.push(ragMessage)

  // Удаляем очень старые сообщения (> 30 дней) для экономии места
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000
  index.messages = index.messages.filter((m) => m.timestamp > thirtyDaysAgo)

  await saveIndex(path, index)
}

/**
 * Удалить сообщение из RAG индекса.
 */
export async function removeMessageFromRAG(id: string, projectPath: string): Promise<void> {
  const paths = [globalRAGIndexPath(), ...(projectPath ? [projectRAGIndexPath(projectPath)] : [])]

  for (const p of paths) {
    const index = await loadIndex(p)
    index.messages = index.messages.filter((m) => m.id !== id)
    await saveIndex(p, index)
  }
}

export interface RAGSearchResult {
  message: OllamaMessage
  id: string
  score: number
}

/**
 * Поиск релевантных сообщений по семантике.
 * Возвращает top-N сообщений отсортированные по убыванию score.
 * Включает сообщения из обоих индексов (глобального и проектного).
 */
export async function searchRAGMessages(
  query: string,
  chatId: string,
  projectPath: string,
  ollamaUrl: string,
  limit = 15,
  minScore = 0.3
): Promise<RAGSearchResult[]> {
  const queryEmbedding = await computeEmbedding(query, ollamaUrl)
  if (!queryEmbedding) return []

  const paths = [globalRAGIndexPath(), ...(projectPath ? [projectRAGIndexPath(projectPath)] : [])]

  const results: RAGSearchResult[] = []

  for (const p of paths) {
    const index = await loadIndex(p)

    // Фильтруем по chatId и вычисляем score
    for (const ragMsg of index.messages) {
      if (ragMsg.chatId !== chatId) continue

      const score = cosineSimilarity(queryEmbedding, ragMsg.embedding)
      if (score < minScore) continue

      results.push({
        id: ragMsg.id,
        score,
        message: {
          role: ragMsg.role,
          content: ragMsg.content
        }
      })
    }
  }

  // Сортируем по score (убывание), потом по времени (новые сначала)
  results.sort((a, b) => {
    const scoreDiff = b.score - a.score
    if (Math.abs(scoreDiff) > 0.01) return scoreDiff
    return 0
  })

  return results.slice(0, limit)
}

/**
 * Получить последние N сообщений из RAG индекса для конкретного чата.
 * Используется как fallback когда поиск не релевантен.
 */
export async function getRecentRAGMessages(
  chatId: string,
  projectPath: string,
  limit = 10
): Promise<RAGSearchResult[]> {
  const paths = [globalRAGIndexPath(), ...(projectPath ? [projectRAGIndexPath(projectPath)] : [])]

  const results: RAGSearchResult[] = []

  for (const p of paths) {
    const index = await loadIndex(p)

    for (const ragMsg of index.messages) {
      if (ragMsg.chatId !== chatId) continue

      results.push({
        id: ragMsg.id,
        score: 0,
        message: {
          role: ragMsg.role,
          content: ragMsg.content
        }
      })
    }
  }

  // Сортируем по времени (новые последнее)
  results.sort((a, b) => {
    const msgA = results.find((r) => r.id === a.id)
    const msgB = results.find((r) => r.id === b.id)
    return (msgB?.message?.content?.length || 0) - (msgA?.message?.content?.length || 0)
  })

  return results.slice(0, limit)
}

/**
 * Очистить все RAG индексы для конкретного чата.
 * Используется при удалении чата.
 */
export async function clearChatFromRAG(chatId: string, projectPath: string): Promise<void> {
  const paths = [globalRAGIndexPath(), ...(projectPath ? [projectRAGIndexPath(projectPath)] : [])]

  for (const p of paths) {
    const index = await loadIndex(p)
    index.messages = index.messages.filter((m) => m.chatId !== chatId)
    await saveIndex(p, index)
  }
}
