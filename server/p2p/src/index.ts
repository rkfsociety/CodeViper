import Fastify from 'fastify'
import { NodeRegistry } from './nodes.js'
import { AuthManager } from './auth.js'
import { registerRoutes } from './routes.js'
import { loadTlsOptions } from './tls.js'

const PORT = parseInt(process.env.PORT ?? '4242', 10)
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const tls = loadTlsOptions()
const app = Fastify({ logger: { level: 'info' }, ...(tls ? { https: tls } : {}) })
const registry = new NodeRegistry()

async function main(): Promise<void> {
  await registry.connect(REDIS_URL)
  const auth = new AuthManager(registry.redisClient)
  await registerRoutes(app, registry, auth)

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    const scheme = tls ? 'https/wss' : 'http/ws'
    console.log(`[p2p-server] listening on :${PORT} (${scheme}, storage: ${registry.storageMode})`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
