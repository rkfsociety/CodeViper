import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { NodeRegistry, P2PNode } from './nodes.js'

const RegisterBody = z.object({
  endpoint: z.string().url(),
  model: z.string().min(1),
  gpuMemMb: z.number().int().positive().optional(),
  cpuPct: z.number().min(0).max(100).optional(),
  ttlSec: z.number().int().min(10).max(3600).optional()
})

const DEFAULT_TTL = parseInt(process.env.NODE_TTL_SEC ?? '120', 10)

export async function registerRoutes(app: FastifyInstance, registry: NodeRegistry): Promise<void> {
  // POST /nodes/register
  app.post<{ Body: unknown }>('/nodes/register', async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() })
    }
    const { endpoint, model, gpuMemMb, cpuPct, ttlSec } = parsed.data

    const node: P2PNode = {
      id: randomUUID(),
      endpoint,
      model,
      ...(gpuMemMb !== undefined && { gpuMemMb }),
      ...(cpuPct !== undefined && { cpuPct }),
      registeredAt: Date.now()
    }

    await registry.register(node, ttlSec ?? DEFAULT_TTL)
    return reply.status(201).send({ ok: true, id: node.id, ttlSec: ttlSec ?? DEFAULT_TTL })
  })

  // GET /nodes/available?model=llama3:8b
  app.get<{ Querystring: { model?: string } }>('/nodes/available', async (req, reply) => {
    const { model } = req.query
    const nodes = await registry.list(model)
    return reply.send({ ok: true, count: nodes.length, nodes })
  })

  // DELETE /nodes/:id
  app.delete<{ Params: { id: string } }>('/nodes/:id', async (req, reply) => {
    const { id } = req.params
    const deleted = await registry.remove(id)
    if (!deleted) {
      return reply.status(404).send({ ok: false, error: 'node not found' })
    }
    return reply.send({ ok: true })
  })

  // GET /health
  app.get('/health', async (_req, reply) => {
    return reply.send({ ok: true, storage: registry.storageMode })
  })
}
