import Fastify from 'fastify'
import { NodeRegistry } from './nodes.js'
import { registerRoutes } from './routes.js'

const PORT = parseInt(process.env.PORT ?? '4242', 10)
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'

const app = Fastify({ logger: { level: 'info' } })
const registry = new NodeRegistry()

async function main(): Promise<void> {
  await registry.connect(REDIS_URL)
  await registerRoutes(app, registry)

  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
    console.log(`[p2p-server] listening on :${PORT} (storage: ${registry.storageMode})`)
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
