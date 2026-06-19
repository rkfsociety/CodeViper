import { parentPort, workerData } from 'worker_threads'

const EMBED_MODEL = (workerData as { model: string }).model ?? 'nomic-embed-text'
const LRU_MAX = 500

// Простой LRU-кеш без внешних зависимостей
class LRUCache<K, V> {
  private map = new Map<K, V>()
  constructor(private max: number) {}

  get(key: K): V | undefined {
    if (!this.map.has(key)) return undefined
    const val = this.map.get(key)!
    this.map.delete(key)
    this.map.set(key, val)
    return val
  }

  set(key: K, val: V): void {
    if (this.map.has(key)) {
      this.map.delete(key)
    } else if (this.map.size >= this.max) {
      this.map.delete(this.map.keys().next().value as K)
    }
    this.map.set(key, val)
  }

  has(key: K): boolean {
    return this.map.has(key)
  }
}

const cache = new LRUCache<string, number[] | null>(LRU_MAX)

async function fetchEmbedding(text: string, ollamaUrl: string): Promise<number[] | null> {
  try {
    const res = await fetch(`${ollamaUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, input: text }),
      signal: AbortSignal.timeout(15_000)
    })
    if (!res.ok) return null
    const data = (await res.json()) as { embeddings?: number[][] }
    return data.embeddings?.[0] ?? null
  } catch {
    return null
  }
}

parentPort!.on(
  'message',
  async (msg: { id: number; type: 'compute'; text: string; ollamaUrl: string }) => {
    if (msg.type !== 'compute') return

    const cacheKey = `${msg.ollamaUrl}\0${msg.text}`

    if (cache.has(cacheKey)) {
      parentPort!.postMessage({ id: msg.id, type: 'result', vec: cache.get(cacheKey) })
      return
    }

    const vec = await fetchEmbedding(msg.text, msg.ollamaUrl)
    cache.set(cacheKey, vec)
    parentPort!.postMessage({ id: msg.id, type: 'result', vec })
  }
)
