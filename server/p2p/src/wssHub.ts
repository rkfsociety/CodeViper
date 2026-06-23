/** Минимальный интерфейс WSS-сокета узла (Fastify websocket / ws). */
export interface P2pNodeSocket {
  send(data: string): void
  close(code?: number, data?: string): void
  readonly readyState: number
  on(event: 'close', listener: () => void): void
}

const nodeSockets = new Map<string, P2pNodeSocket>()

export function registerNodeSocket(nodeId: string, socket: P2pNodeSocket): void {
  const existing = nodeSockets.get(nodeId)
  if (existing && existing !== socket) {
    try {
      existing.close(1000, 'replaced')
    } catch {
      /* ignore */
    }
  }
  nodeSockets.set(nodeId, socket)
  socket.on('close', () => {
    if (nodeSockets.get(nodeId) === socket) nodeSockets.delete(nodeId)
  })
}

export function deliverEncryptedTask(
  targetNodeId: string,
  message: string
): { delivered: boolean; reason?: string } {
  const socket = nodeSockets.get(targetNodeId)
  if (!socket || socket.readyState !== 1) {
    return { delivered: false, reason: 'node offline or not subscribed via WSS' }
  }
  socket.send(message)
  return { delivered: true }
}

/** Сброс (только тесты). */
export function resetWssHubForTests(): void {
  nodeSockets.clear()
}
