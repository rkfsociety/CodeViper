import { app } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import type { AgentSettings } from '../../src/types'

// ─── Интерфейс ───────────────────────────────────────────────────

export interface VectorStoreMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  embedding: number[]
  chatId: string
  timestamp: number
}

export interface VectorSearchResult {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  chatId: string
  timestamp: number
  score: number
}

export interface VectorStore {
  /** Добавить или обновить сообщение */
  upsert(msg: VectorStoreMessage): Promise<void>
  /** Поиск ближайших векторов для данного chatId */
  search(
    queryEmbedding: number[],
    chatId: string,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]>
  /** Удалить сообщение по ID */
  delete(id: string): Promise<void>
  /** Удалить все сообщения чата */
  clearChat(chatId: string): Promise<void>
  /** Удалить сообщения старше N дней */
  pruneOld(days: number): Promise<void>
}

// ─── Конфиг и фабрика ────────────────────────────────────────────

export interface VectorStoreConfig {
  provider: 'local' | 'qdrant' | 'milvus'
  projectPath?: string
  qdrantUrl?: string
  qdrantApiKey?: string
  milvusUrl?: string
  milvusApiKey?: string
}

export function buildVectorStoreConfig(
  settings: Pick<
    AgentSettings,
    'ragProvider' | 'qdrantUrl' | 'qdrantApiKey' | 'milvusUrl' | 'milvusApiKey'
  >,
  projectPath?: string
): VectorStoreConfig {
  const provider = settings.ragProvider ?? 'local'
  return {
    provider,
    projectPath,
    qdrantUrl: settings.qdrantUrl,
    qdrantApiKey: settings.qdrantApiKey,
    milvusUrl: settings.milvusUrl,
    milvusApiKey: settings.milvusApiKey
  }
}

export function createVectorStore(config: VectorStoreConfig): VectorStore {
  if (config.provider === 'qdrant' && config.qdrantUrl) {
    return new QdrantVectorStore(config.qdrantUrl, config.qdrantApiKey)
  }
  if (config.provider === 'milvus' && config.milvusUrl) {
    return new MilvusVectorStore(config.milvusUrl, config.milvusApiKey)
  }
  return new LocalVectorStore(config.projectPath)
}

// ─── LocalVectorStore (JSON на диске) ────────────────────────────

const LOCAL_INDEX_FILENAME = 'contextRAG.json'

interface LocalIndex {
  version: number
  messages: VectorStoreMessage[]
  lastUpdated: number
}

function emptyLocalIndex(): LocalIndex {
  return { version: 1, messages: [], lastUpdated: Date.now() }
}

async function loadLocalIndex(path: string): Promise<LocalIndex> {
  if (!existsSync(path)) return emptyLocalIndex()
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as LocalIndex
    if (!Array.isArray(parsed.messages)) return emptyLocalIndex()
    return parsed
  } catch {
    return emptyLocalIndex()
  }
}

async function saveLocalIndex(path: string, index: LocalIndex): Promise<void> {
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

export class LocalVectorStore implements VectorStore {
  private globalPath: string
  private projectIndexPath: string | null

  constructor(projectPath?: string) {
    this.globalPath = join(app.getPath('userData'), LOCAL_INDEX_FILENAME)
    this.projectIndexPath = projectPath
      ? join(projectPath, '.codeviper', LOCAL_INDEX_FILENAME)
      : null
  }

  private paths(): string[] {
    return [this.globalPath, ...(this.projectIndexPath ? [this.projectIndexPath] : [])]
  }

  private writePath(): string {
    return this.projectIndexPath ?? this.globalPath
  }

  async upsert(msg: VectorStoreMessage): Promise<void> {
    const path = this.writePath()
    const index = await loadLocalIndex(path)
    index.messages = index.messages.filter((m) => m.id !== msg.id)
    index.messages.push(msg)
    await saveLocalIndex(path, index)
  }

  async search(
    queryEmbedding: number[],
    chatId: string,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    const results: VectorSearchResult[] = []
    for (const p of this.paths()) {
      const index = await loadLocalIndex(p)
      for (const m of index.messages) {
        if (m.chatId !== chatId) continue
        const score = cosineSimilarity(queryEmbedding, m.embedding)
        if (score < minScore) continue
        results.push({
          id: m.id,
          role: m.role,
          content: m.content,
          chatId: m.chatId,
          timestamp: m.timestamp,
          score
        })
      }
    }
    results.sort((a, b) => b.score - a.score)
    return results.slice(0, limit)
  }

  async delete(id: string): Promise<void> {
    for (const p of this.paths()) {
      const index = await loadLocalIndex(p)
      const before = index.messages.length
      index.messages = index.messages.filter((m) => m.id !== id)
      if (index.messages.length !== before) await saveLocalIndex(p, index)
    }
  }

  async clearChat(chatId: string): Promise<void> {
    for (const p of this.paths()) {
      const index = await loadLocalIndex(p)
      index.messages = index.messages.filter((m) => m.chatId !== chatId)
      await saveLocalIndex(p, index)
    }
  }

  async pruneOld(days: number): Promise<void> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    for (const p of this.paths()) {
      const index = await loadLocalIndex(p)
      index.messages = index.messages.filter((m) => m.timestamp > cutoff)
      await saveLocalIndex(p, index)
    }
  }
}

// ─── QdrantVectorStore ────────────────────────────────────────────

const QDRANT_COLLECTION = 'codeviper_rag'

/** Детерминированный хэш строки → неотрицательный int32 для Qdrant point ID */
function strToQdrantId(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) & 0x7fffffff
  return h === 0 ? 1 : h
}

export class QdrantVectorStore implements VectorStore {
  private baseUrl: string
  private headers: Record<string, string>
  private collectionEnsured = false

  constructor(url: string, apiKey?: string) {
    this.baseUrl = url.replace(/\/$/, '')
    this.headers = { 'Content-Type': 'application/json' }
    if (apiKey) this.headers['api-key'] = apiKey
  }

  private async ensureCollection(dim: number): Promise<void> {
    if (this.collectionEnsured) return
    const res = await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}`, {
      headers: this.headers,
      signal: AbortSignal.timeout(5000)
    })
    if (!res.ok) {
      await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}`, {
        method: 'PUT',
        headers: this.headers,
        body: JSON.stringify({ vectors: { size: dim, distance: 'Cosine' } }),
        signal: AbortSignal.timeout(5000)
      })
    }
    this.collectionEnsured = true
  }

  async upsert(msg: VectorStoreMessage): Promise<void> {
    await this.ensureCollection(msg.embedding.length)
    await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}/points`, {
      method: 'PUT',
      headers: this.headers,
      body: JSON.stringify({
        points: [
          {
            id: strToQdrantId(msg.id),
            vector: msg.embedding,
            payload: {
              orig_id: msg.id,
              role: msg.role,
              content: msg.content,
              chatId: msg.chatId,
              timestamp: msg.timestamp
            }
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })
  }

  async search(
    queryEmbedding: number[],
    chatId: string,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    if (!this.collectionEnsured) {
      const check = await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}`, {
        headers: this.headers,
        signal: AbortSignal.timeout(5000)
      }).catch(() => null)
      if (!check?.ok) return []
      this.collectionEnsured = true
    }
    const res = await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        vector: queryEmbedding,
        filter: { must: [{ key: 'chatId', match: { value: chatId } }] },
        limit,
        with_payload: true,
        score_threshold: minScore
      }),
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) return []
    const data = (await res.json()) as {
      result?: Array<{
        id: number
        score: number
        payload: Record<string, unknown>
      }>
    }
    return (data.result ?? []).map((r) => ({
      id: String(r.payload.orig_id ?? r.id),
      role: (r.payload.role as VectorSearchResult['role']) ?? 'assistant',
      content: String(r.payload.content ?? ''),
      chatId: String(r.payload.chatId ?? ''),
      timestamp: Number(r.payload.timestamp ?? 0),
      score: r.score
    }))
  }

  async delete(id: string): Promise<void> {
    await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}/points/delete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ points: [strToQdrantId(id)] }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {})
  }

  async clearChat(chatId: string): Promise<void> {
    await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}/points/delete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        filter: { must: [{ key: 'chatId', match: { value: chatId } }] }
      }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {})
  }

  async pruneOld(days: number): Promise<void> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    await fetch(`${this.baseUrl}/collections/${QDRANT_COLLECTION}/points/delete`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({
        filter: { must: [{ key: 'timestamp', range: { lt: cutoff } }] }
      }),
      signal: AbortSignal.timeout(5000)
    }).catch(() => {})
  }
}

// ─── MilvusVectorStore ────────────────────────────────────────────

const MILVUS_COLLECTION = 'codeviper_rag'

export class MilvusVectorStore implements VectorStore {
  private baseUrl: string
  private headers: Record<string, string>
  private collectionEnsured = false

  constructor(url: string, apiKey?: string) {
    this.baseUrl = url.replace(/\/$/, '') + '/v2/vectordb'
    this.headers = { 'Content-Type': 'application/json' }
    if (apiKey) this.headers['Authorization'] = `Bearer ${apiKey}`
  }

  private async post<T = unknown>(path: string, body: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000)
    })
    if (!res.ok) throw new Error(`Milvus ${path} ${res.status}`)
    return res.json() as Promise<T>
  }

  private async ensureCollection(dim: number): Promise<void> {
    if (this.collectionEnsured) return
    try {
      await this.post('/collections/describe', { collectionName: MILVUS_COLLECTION })
      this.collectionEnsured = true
      return
    } catch {
      // Коллекция не существует — создаём
    }
    await this.post('/collections/create', {
      collectionName: MILVUS_COLLECTION,
      schema: {
        fields: [
          {
            fieldName: 'msg_id',
            dataType: 'VarChar',
            isPrimary: true,
            params: { max_length: '64' }
          },
          { fieldName: 'embedding', dataType: 'FloatVector', params: { dim: String(dim) } },
          { fieldName: 'role', dataType: 'VarChar', params: { max_length: '16' } },
          { fieldName: 'content', dataType: 'VarChar', params: { max_length: '65535' } },
          { fieldName: 'chat_id', dataType: 'VarChar', params: { max_length: '64' } },
          { fieldName: 'ts', dataType: 'Int64' }
        ]
      },
      indexParams: [{ fieldName: 'embedding', indexName: 'idx_emb', metricType: 'COSINE' }]
    })
    this.collectionEnsured = true
  }

  async upsert(msg: VectorStoreMessage): Promise<void> {
    await this.ensureCollection(msg.embedding.length)
    await this.post('/entities/upsert', {
      collectionName: MILVUS_COLLECTION,
      data: [
        {
          msg_id: msg.id.slice(0, 64),
          embedding: msg.embedding,
          role: msg.role,
          content: msg.content.slice(0, 65530),
          chat_id: msg.chatId.slice(0, 64),
          ts: msg.timestamp
        }
      ]
    })
  }

  async search(
    queryEmbedding: number[],
    chatId: string,
    limit: number,
    minScore: number
  ): Promise<VectorSearchResult[]> {
    if (!this.collectionEnsured) {
      try {
        await this.post('/collections/describe', { collectionName: MILVUS_COLLECTION })
        this.collectionEnsured = true
      } catch {
        return []
      }
    }
    const res = await this.post<{
      data?: Array<{
        msg_id: string
        role: string
        content: string
        chat_id: string
        ts: number
        distance: number
      }>
    }>('/entities/search', {
      collectionName: MILVUS_COLLECTION,
      data: [queryEmbedding],
      annsField: 'embedding',
      limit,
      filter: `chat_id == "${chatId.replace(/"/g, '')}"`,
      outputFields: ['msg_id', 'role', 'content', 'chat_id', 'ts'],
      searchParams: { metric_type: 'COSINE' }
    })
    return (res.data ?? [])
      .filter((r) => r.distance >= minScore)
      .map((r) => ({
        id: r.msg_id,
        role: r.role as VectorSearchResult['role'],
        content: r.content,
        chatId: r.chat_id,
        timestamp: r.ts,
        score: r.distance
      }))
  }

  async delete(id: string): Promise<void> {
    await this.post('/entities/delete', {
      collectionName: MILVUS_COLLECTION,
      filter: `msg_id == "${id.replace(/"/g, '').slice(0, 64)}"`
    }).catch(() => {})
  }

  async clearChat(chatId: string): Promise<void> {
    await this.post('/entities/delete', {
      collectionName: MILVUS_COLLECTION,
      filter: `chat_id == "${chatId.replace(/"/g, '').slice(0, 64)}"`
    }).catch(() => {})
  }

  async pruneOld(days: number): Promise<void> {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
    await this.post('/entities/delete', {
      collectionName: MILVUS_COLLECTION,
      filter: `ts < ${cutoff}`
    }).catch(() => {})
  }
}
