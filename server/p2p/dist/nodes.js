import { Redis } from 'ioredis';
const KEY_PREFIX = 'node:';
const memStore = new Map();
/** Сброс in-memory реестра (только unit/integration-тесты). */
export function resetNodeRegistryMemStoreForTests() {
    memStore.clear();
}
function memSet(id, node, ttlSec) {
    memStore.set(id, { node, expiresAt: Date.now() + ttlSec * 1000 });
}
function memGet(id) {
    const entry = memStore.get(id);
    if (!entry)
        return null;
    if (Date.now() > entry.expiresAt) {
        memStore.delete(id);
        return null;
    }
    return entry.node;
}
function memDel(id) {
    return memStore.delete(id);
}
function memList() {
    const now = Date.now();
    const alive = [];
    for (const [id, entry] of memStore) {
        if (now > entry.expiresAt) {
            memStore.delete(id);
            continue;
        }
        alive.push(entry.node);
    }
    return alive;
}
// ─── NodeRegistry ──────────────────────────────────────────────────────────
export class NodeRegistry {
    redis = null;
    mode = 'memory';
    async connect(redisUrl) {
        const client = new Redis(redisUrl, {
            maxRetriesPerRequest: 1,
            connectTimeout: 3000,
            lazyConnect: true
        });
        try {
            await client.connect();
            await client.ping();
            this.redis = client;
            this.mode = 'redis';
            console.log(`[registry] Redis connected — ${redisUrl}`);
        }
        catch (err) {
            await client.quit().catch(() => { });
            this.mode = 'memory';
            console.warn(`[registry] Redis unavailable (${err.message}) — using in-memory store`);
        }
    }
    get storageMode() {
        return this.mode;
    }
    get redisClient() {
        return this.redis;
    }
    async register(node, ttlSec) {
        const json = JSON.stringify(node);
        if (this.redis) {
            await this.redis.set(`${KEY_PREFIX}${node.id}`, json, 'EX', ttlSec);
        }
        else {
            memSet(node.id, node, ttlSec);
        }
    }
    async get(id) {
        if (this.redis) {
            const raw = await this.redis.get(`${KEY_PREFIX}${id}`);
            return raw ? JSON.parse(raw) : null;
        }
        return memGet(id);
    }
    async remove(id) {
        if (this.redis) {
            const deleted = await this.redis.del(`${KEY_PREFIX}${id}`);
            return deleted > 0;
        }
        return memDel(id);
    }
    async list(modelFilter) {
        let nodes;
        if (this.redis) {
            const keys = [];
            let cursor = '0';
            do {
                const [nextCursor, batch] = await this.redis.scan(cursor, 'MATCH', `${KEY_PREFIX}*`, 'COUNT', 100);
                cursor = nextCursor;
                keys.push(...batch);
            } while (cursor !== '0');
            const values = keys.length > 0 ? await this.redis.mget(...keys) : [];
            nodes = values
                .filter((v) => v !== null)
                .map((v) => JSON.parse(v));
        }
        else {
            nodes = memList();
        }
        if (modelFilter) {
            nodes = nodes.filter((n) => n.model === modelFilter);
        }
        return nodes;
    }
}
