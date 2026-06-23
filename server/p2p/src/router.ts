import type { NodeRegistry, P2PNode } from './nodes.js'
import { isNodeOnline } from './wssHub.js'

export type RouteTaskResult =
  | { ok: true; node: P2PNode }
  | { ok: false; fallback: true; reason: string }

/** Сравнение узлов: ниже cpuPct → приоритет; при равенстве — раньше зарегистрирован. */
export function compareNodePriority(a: P2PNode, b: P2PNode): number {
  const cpuA = a.cpuPct ?? 100
  const cpuB = b.cpuPct ?? 100
  if (cpuA !== cpuB) return cpuA - cpuB
  return a.registeredAt - b.registeredAt
}

/**
 * Выбрать свободный онлайн-узел с нужной моделью.
 * «Свободный» = подключён по WSS и с наименьшей загрузкой CPU среди кандидатов.
 */
export function selectFreeNodeForModel(
  candidates: P2PNode[],
  model: string,
  onlineCheck: (nodeId: string) => boolean = isNodeOnline
): P2PNode | null {
  const eligible = candidates
    .filter((n) => n.model === model && onlineCheck(n.id))
    .sort(compareNodePriority)

  return eligible[0] ?? null
}

/** Маршрутизация задачи: найти узел с моделью или вернуть fallback. */
export async function routeTaskForModel(
  registry: NodeRegistry,
  model: string,
  onlineCheck: (nodeId: string) => boolean = isNodeOnline
): Promise<RouteTaskResult> {
  const trimmed = model.trim()
  if (!trimmed) {
    return { ok: false, fallback: true, reason: 'model is required' }
  }

  const candidates = await registry.list(trimmed)
  if (candidates.length === 0) {
    return { ok: false, fallback: true, reason: `no nodes registered for model ${trimmed}` }
  }

  const node = selectFreeNodeForModel(candidates, trimmed, onlineCheck)
  if (!node) {
    return { ok: false, fallback: true, reason: `no online nodes for model ${trimmed}` }
  }

  return { ok: true, node }
}
