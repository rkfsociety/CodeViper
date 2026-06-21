import type { OllamaMessage } from './agentContext'
import { computeEmbedding } from './embeddings'
import { createVectorStore, LocalVectorStore } from './vectorStore'
import type { VectorStoreConfig } from './vectorStore'

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
