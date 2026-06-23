import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { NodeRegistry, P2PNode } from './nodes.js'
import type { AuthManager } from './auth.js'
import { formatEncryptedTaskRelayLog } from './p2pCrypto.js'
import { deliverEncryptedTask, registerNodeSocket } from './wssHub.js'

const RegisterBody = z.object({
  endpoint: z.string().url(),
  model: z.string().min(1),
  publicKey: z.string().min(1).optional(),
  gpuMemMb: z.number().int().positive().optional(),
  cpuPct: z.number().min(0).max(100).optional(),
  ttlSec: z.number().int().min(10).max(3600).optional()
})

const RelayTaskBody = z.object({
  taskId: z.string().min(1),
  targetNodeId: z.string().min(1),
  payload: z.object({
    ephemeralPublicKey: z.string().min(1),
    ciphertext: z.string().min(1),
    iv: z.string().min(1),
    authTag: z.string().min(1)
  })
})

const EmailBody = z.object({
  email: z.string().email(),
  password: z.string().min(8)
})

const DEFAULT_TTL = parseInt(process.env.NODE_TTL_SEC ?? '120', 10)

// ─── Auth middleware ────────────────────────────────────────────────────────

function requireAuth(auth: AuthManager) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null

    if (!token) {
      return reply.status(401).send({ ok: false, error: 'Missing Authorization header' })
    }

    const payload = auth.verifyToken(token)
    if (!payload) {
      return reply.status(401).send({ ok: false, error: 'Invalid or expired token' })
    }

    const { allowed, remaining } = await auth.checkRateLimit(payload.sub)
    reply.header('X-RateLimit-Remaining', remaining)

    if (!allowed) {
      return reply.status(429).send({ ok: false, error: 'Rate limit exceeded' })
    }

    // attach userId to request for downstream handlers
    ;(req as FastifyRequest & { userId: string }).userId = payload.sub
  }
}

// ─── Route registration ─────────────────────────────────────────────────────

export async function registerRoutes(
  app: FastifyInstance,
  registry: NodeRegistry,
  auth: AuthManager
): Promise<void> {
  const authHook = requireAuth(auth)
  await app.register(websocket)

  // ── Auth: email register ──────────────────────────────────────────────────
  app.post<{ Body: unknown }>('/auth/register', async (req, reply) => {
    const parsed = EmailBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() })
    }
    try {
      const result = await auth.register(parsed.data.email, parsed.data.password)
      return reply.status(201).send({ ok: true, token: result.token, userId: result.userId })
    } catch (e) {
      return reply.status(409).send({ ok: false, error: (e as Error).message })
    }
  })

  // ── Auth: email login ─────────────────────────────────────────────────────
  app.post<{ Body: unknown }>('/auth/login', async (req, reply) => {
    const parsed = EmailBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() })
    }
    try {
      const result = await auth.login(parsed.data.email, parsed.data.password)
      return reply.send({ ok: true, token: result.token, userId: result.userId })
    } catch {
      return reply.status(401).send({ ok: false, error: 'Invalid credentials' })
    }
  })

  // ── Auth: GitHub OAuth redirect ───────────────────────────────────────────
  app.get('/auth/github', async (_req, reply) => {
    const state = randomUUID()
    try {
      const url = auth.githubAuthUrl(state)
      return reply.redirect(url)
    } catch (e) {
      return reply.status(501).send({ ok: false, error: (e as Error).message })
    }
  })

  // ── Auth: GitHub OAuth callback ───────────────────────────────────────────
  app.get<{ Querystring: { code?: string; error?: string } }>(
    '/auth/github/callback',
    async (req, reply) => {
      const { code, error } = req.query
      if (error || !code) {
        return reply.status(400).send({ ok: false, error: error ?? 'missing code' })
      }
      try {
        const result = await auth.exchangeGithubCode(code)
        return reply.send({ ok: true, token: result.token, userId: result.userId })
      } catch (e) {
        return reply.status(502).send({ ok: false, error: (e as Error).message })
      }
    }
  )

  // ── Protected: POST /nodes/register ──────────────────────────────────────
  app.post<{ Body: unknown }>('/nodes/register', { preHandler: authHook }, async (req, reply) => {
    const parsed = RegisterBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() })
    }
    const { endpoint, model, publicKey, gpuMemMb, cpuPct, ttlSec } = parsed.data

    const node: P2PNode = {
      id: randomUUID(),
      endpoint,
      model,
      ...(publicKey !== undefined && { publicKey }),
      ...(gpuMemMb !== undefined && { gpuMemMb }),
      ...(cpuPct !== undefined && { cpuPct }),
      registeredAt: Date.now()
    }

    await registry.register(node, ttlSec ?? DEFAULT_TTL)
    return reply.status(201).send({ ok: true, id: node.id, ttlSec: ttlSec ?? DEFAULT_TTL })
  })

  // ── Protected: GET /nodes/available ──────────────────────────────────────
  app.get<{ Querystring: { model?: string } }>(
    '/nodes/available',
    { preHandler: authHook },
    async (req, reply) => {
      const { model } = req.query
      const nodes = await registry.list(model)
      return reply.send({ ok: true, count: nodes.length, nodes })
    }
  )

  // ── Protected: POST /tasks/relay (только шифротекст, без plaintext в логах) ─
  app.post<{ Body: unknown }>('/tasks/relay', { preHandler: authHook }, async (req, reply) => {
    const parsed = RelayTaskBody.safeParse(req.body)
    if (!parsed.success) {
      return reply.status(400).send({ ok: false, error: parsed.error.flatten() })
    }
    const { taskId, targetNodeId, payload } = parsed.data

    const target = await registry.get(targetNodeId)
    if (!target) {
      return reply.status(404).send({ ok: false, error: 'target node not found' })
    }

    const logLine = formatEncryptedTaskRelayLog({ taskId, targetNodeId, payload })
    req.log.info(logLine)

    const wire = JSON.stringify({ type: 'task', taskId, payload })
    const delivery = deliverEncryptedTask(targetNodeId, wire)
    if (!delivery.delivered) {
      return reply.status(503).send({ ok: false, error: delivery.reason ?? 'delivery failed' })
    }

    return reply.send({ ok: true, taskId, targetNodeId })
  })

  // ── WSS: подписка узла на входящие задачи ────────────────────────────────
  app.get(
    '/nodes/ws',
    { websocket: true },
    (socket, req) => {
      const query = req.query as { nodeId?: string; token?: string }
      const nodeId = query.nodeId?.trim()
      const token = query.token?.trim()

      if (!nodeId || !token) {
        socket.close(1008, 'nodeId and token required')
        return
      }

      const payload = auth.verifyToken(token)
      if (!payload) {
        socket.close(1008, 'invalid token')
        return
      }

      registerNodeSocket(nodeId, socket)
      socket.send(JSON.stringify({ type: 'subscribed', nodeId }))
    }
  )

  // ── Protected: DELETE /nodes/:id ─────────────────────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/nodes/:id',
    { preHandler: authHook },
    async (req, reply) => {
      const { id } = req.params
      const deleted = await registry.remove(id)
      if (!deleted) {
        return reply.status(404).send({ ok: false, error: 'node not found' })
      }
      return reply.send({ ok: true })
    }
  )

  // ── Public: GET /health ───────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    return reply.send({ ok: true, storage: registry.storageMode })
  })
}
