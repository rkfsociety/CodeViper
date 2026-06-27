import type { AgentTraceEvent } from './types'

const MAX_EVENTS = 2000

// chatId → events[]
const buffers = new Map<string, AgentTraceEvent[]>()
const listeners = new Set<(chatId: string) => void>()

export function getTraceEvents(chatId: string): AgentTraceEvent[] {
  return buffers.get(chatId) ?? []
}

function mergeTraceEvents(a: AgentTraceEvent[], b: AgentTraceEvent[]): AgentTraceEvent[] {
  const byTs = new Map<number, AgentTraceEvent>()
  for (const e of a) byTs.set(e.ts, e)
  for (const e of b) byTs.set(e.ts, e)
  return [...byTs.values()].sort((x, y) => x.ts - y.ts).slice(-MAX_EVENTS)
}

export function setTraceEvents(chatId: string, events: AgentTraceEvent[]): void {
  const list = events.slice(-MAX_EVENTS)
  buffers.set(chatId, list)
  listeners.forEach((fn) => fn(chatId))
}

export async function hydrateTraceEvents(chatId: string): Promise<void> {
  let loaded: AgentTraceEvent[] = []
  try {
    loaded = await window.codeviper.loadChatTrace(chatId)
  } catch {
    // Старый shell без IPC load-chat-trace — только in-memory буфер
  }
  const current = buffers.get(chatId) ?? []
  setTraceEvents(chatId, mergeTraceEvents(loaded, current))
}

export function clearTraceEvents(chatId: string): void {
  buffers.set(chatId, [])
  void window.codeviper.clearChatTrace(chatId).catch(() => {})
  listeners.forEach((fn) => fn(chatId))
}

export function onTraceUpdate(fn: (chatId: string) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function initTraceBuffer(): () => void {
  return window.codeviper.onAgentStream((event) => {
    if (event.type !== 'trace' || !event.traceEvent || !event.chatId) return
    const list = buffers.get(event.chatId) ?? []
    list.push(event.traceEvent)
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS)
    buffers.set(event.chatId, list)
    listeners.forEach((fn) => fn(event.chatId))
  })
}
