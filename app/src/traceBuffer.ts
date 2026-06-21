import type { AgentTraceEvent } from './types'

const MAX_EVENTS = 2000

// chatId → events[]
const buffers = new Map<string, AgentTraceEvent[]>()
const listeners = new Set<(chatId: string) => void>()

export function getTraceEvents(chatId: string): AgentTraceEvent[] {
  return buffers.get(chatId) ?? []
}

export function clearTraceEvents(chatId: string): void {
  buffers.set(chatId, [])
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
