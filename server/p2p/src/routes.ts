import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { randomUUID } from 'crypto'
import type { NodeRegistry, P2PNode } from './nodes.js'
import type { AuthManager } from './auth.js'

const RegisterBody = z.object({
  endpoint: z.string().url(),
  model: z.string().min(1),
  gpuMemMb: z.number().int().positive().optional(),
  cpuPct: z.number().min(0).max(100).optional(),
  ttlSec: z.number().int().min(10).max(3600).optional()
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
