import { Redis } from 'ioredis'

export interface P2PNode {
  id: string
  endpoint: string
  model: string
  /** Владелец узла (userId из JWT) */
  ownerUserId?: string
  /** X25519 public key (SPKI DER, base64) для ECDH-шифрования промптов */
  publicKey?: string
  gpuMemMb?: number
  cpuPct?: number
  registeredAt: number
}

const KEY_PREFIX = 'node:'

// ─── In-memory fallback ────────────────────────────────────────────────────

interface MemEntry {
  node: P2PNode
  expiresAt: number
}

const memStore = new Map<string, MemEntry>()

/** Сброс in-memory реестра (только unit/integration-тесты). */
export function resetNodeRegistryMemStoreForTests(): void {
  memStore.clear()
}

function memSet(id: string, node: P2PNode, ttlSec: number): void {
  memStore.set(id, { node, expiresAt: Date.now() + ttlSec * 1000 })
}

function memGet(id: string): P2PNode | null {
  const entry = memStore.get(id)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) { memStore.delete(id); return null }
  return entry.node
}

function memDel(id: string): boolean {
  return memStore.delete(id)
}

function memList(): P2PNode[] {
  const now = Date.now()
  const alive: P2PNode[] = []
  for (const [id, entry] of memStore) {
    if (now > entry.expiresAt) { memStore.delete(id); continue }
    alive.push(entry.node)
  }
  return alive
}

// ─── NodeRegistry ──────────────────────────────────────────────────────────

export class NodeRegistry {
  private redis: InstanceType<typeof Redis> | null = null
  private mode: 'redis' | 'memory' = 'memory'

  async connect(redisUrl: string): Promise<void> {
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000,
      lazyConnect: true
    })
    try {
      await client.connect()
      await client.ping()
      this.redis = client
      this.mode = 'redis'
      console.log(`[registry] Redis connected — ${redisUrl}`)
    } catch (err) {
      await client.quit().catch(() => {})
      this.mode = 'memory'
      console.warn(`[registry] Redis unavailable (${(err as Error).message}) — using in-memory store`)
    }
  }

  get storageMode(): 'redis' | 'memory' {
    return this.mode
  }

  get redisClient(): InstanceType<typeof Redis> | null {
    return this.redis
  }

  async register(node: P2PNode, ttlSec: number): Promise<void> {
    const json = JSON.stringify(node)
    if (this.redis) {
      await this.redis.set(`${KEY_PREFIX}${node.id}`, json, 'EX', ttlSec)
    } else {
      memSet(node.id, node, ttlSec)
    }
  }

  async get(id: string): Promise<P2PNode | null> {
    if (this.redis) {
      const raw = await this.redis.get(`${KEY_PREFIX}${id}`)
      return raw ? (JSON.parse(raw) as P2PNode) : null
    }
    return memGet(id)
  }

  async remove(id: string): Promise<boolean> {
    if (this.redis) {
      const deleted = await this.redis.del(`${KEY_PREFIX}${id}`)
      return deleted > 0
    }
    return memDel(id)
  }

  async list(modelFilter?: string): Promise<P2PNode[]> {
    let nodes: P2PNode[]

    if (this.redis) {
      const keys: string[] = []
      let cursor = '0'
      do {
        const [nextCursor, batch] = await this.redis.scan(
          cursor,
          'MATCH',
          `${KEY_PREFIX}*`,
          'COUNT',
          100
        )
        cursor = nextCursor
        keys.push(...batch)
      } while (cursor !== '0')

      const values: Array<string | null> = keys.length > 0 ? await this.redis.mget(...keys) : []
      nodes = values
        .filter((v): v is string => v !== null)
        .map((v: string) => JSON.parse(v) as P2PNode)
    } else {
      nodes = memList()
    }

    if (modelFilter) {
      nodes = nodes.filter((n) => n.model === modelFilter)
    }
    return nodes
  }
}
