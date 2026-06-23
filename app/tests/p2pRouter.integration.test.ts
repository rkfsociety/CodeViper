import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  NodeRegistry,
  type P2PNode,
  resetNodeRegistryMemStoreForTests
} from '../../server/p2p/src/nodes.js'
import { routeTaskForModel, selectFreeNodeForModel } from '../../server/p2p/src/router.js'
import {
  registerNodeSocket,
  resetWssHubForTests,
  type P2pNodeSocket
} from '../../server/p2p/src/wssHub.js'

const MODEL = 'qwen2.5-coder:7b'

function mockSocket(online = true): P2pNodeSocket {
  return {
    send: vi.fn(),
    close: vi.fn(),
    readyState: online ? 1 : 0,
    on: vi.fn()
  }
}

function makeNode(id: string, cpuPct?: number): P2PNode {
  return {
    id,
    endpoint: `https://node-${id}.example/p2p`,
    model: MODEL,
    publicKey: Buffer.from(`pk-${id}`).toString('base64'),
    ...(cpuPct !== undefined ? { cpuPct } : {}),
    registeredAt: Date.now()
  }
}

describe('p2p router integration', () => {
  let registry: NodeRegistry

  beforeEach(async () => {
    resetWssHubForTests()
    resetNodeRegistryMemStoreForTests()
    registry = new NodeRegistry()
    await registry.connect('redis://127.0.0.1:1')
  })

  it('выбирает онлайн-узел с меньшей CPU среди двух mock-узлов', async () => {
    const busy = makeNode('node-busy', 40)
    const idle = makeNode('node-idle', 5)
    await registry.register(busy, 120)
    await registry.register(idle, 120)

    registerNodeSocket(busy.id, mockSocket(true))
    registerNodeSocket(idle.id, mockSocket(true))

    const result = await routeTaskForModel(registry, MODEL)
    expect(result).toMatchObject({ ok: true, node: { id: 'node-idle' } })
  })

  it('пропускает офлайн-узел и выбирает второй mock-узел', async () => {
    const offline = makeNode('node-off', 1)
    const online = makeNode('node-on', 50)
    await registry.register(offline, 120)
    await registry.register(online, 120)

    registerNodeSocket(offline.id, mockSocket(false))
    registerNodeSocket(online.id, mockSocket(true))

    const result = await routeTaskForModel(registry, MODEL)
    expect(result).toMatchObject({ ok: true, node: { id: 'node-on' } })
  })

  it('возвращает fallback, если нет онлайн-узлов с моделью', async () => {
    const n1 = makeNode('n1', 10)
    const n2 = makeNode('n2', 20)
    await registry.register(n1, 120)
    await registry.register(n2, 120)

    const result = await routeTaskForModel(registry, MODEL)
    expect(result).toEqual({
      ok: false,
      fallback: true,
      reason: `no online nodes for model ${MODEL}`
    })
  })

  it('возвращает fallback при отсутствии узлов с моделью', async () => {
    const other = { ...makeNode('x'), model: 'other-model' }
    await registry.register(other, 120)
    registerNodeSocket(other.id, mockSocket(true))

    const result = await routeTaskForModel(registry, MODEL)
    expect(result).toEqual({
      ok: false,
      fallback: true,
      reason: `no nodes registered for model ${MODEL}`
    })
  })

  it('selectFreeNodeForModel фильтрует по onlineCheck', () => {
    const nodes = [makeNode('a', 10), makeNode('b', 30)]
    const picked = selectFreeNodeForModel(nodes, MODEL, (id) => id === 'b')
    expect(picked?.id).toBe('b')
  })
})
