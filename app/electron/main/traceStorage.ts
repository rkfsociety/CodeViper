import { existsSync } from 'fs'
import { mkdir, readFile, readdir, unlink, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { AgentTraceEvent } from '../../src/types'
import { AGENT_TRACE_SCHEMA_VERSION } from '../../shared/constants'
import { backupCorruptFile, writeJsonAtomic } from './fsUtil'

const MAX_EVENTS = 2000
const SAVE_DEBOUNCE_MS = 300

interface ChatTraceFile {
  chatId: string
  updatedAt: number
  events: AgentTraceEvent[]
}

const traceCaches = new Map<string, AgentTraceEvent[]>()
const loadPromises = new Map<string, Promise<AgentTraceEvent[]>>()
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()
const flushInFlight = new Set<Promise<void>>()

export function getAgentTracesDir(): string {
  return join(app.getPath('userData'), 'traces')
}

function chatTracesDir(): string {
  return join(getAgentTracesDir(), 'chats')
}

function chatTracePath(chatId: string): string {
  return join(chatTracesDir(), `${chatId}.json`)
}

async function loadChatTraceFromDisk(chatId: string): Promise<AgentTraceEvent[]> {
  const path = chatTracePath(chatId)
  if (!existsSync(path)) return []

  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw) as ChatTraceFile
    if (!Array.isArray(parsed.events)) throw new Error('bad trace shape')
    return parsed.events.slice(-MAX_EVENTS)
  } catch {
    await backupCorruptFile(path)
    return []
  }
}

async function ensureTraceCache(chatId: string): Promise<AgentTraceEvent[]> {
  const cached = traceCaches.get(chatId)
  if (cached) return cached

  let promise = loadPromises.get(chatId)
  if (!promise) {
    promise = (async () => {
      const events = await loadChatTraceFromDisk(chatId)
      traceCaches.set(chatId, events)
      return events
    })()
    loadPromises.set(chatId, promise)
  }

  return promise
}

function scheduleChatTraceSave(chatId: string): void {
  const existing = saveTimers.get(chatId)
  if (existing) clearTimeout(existing)
  saveTimers.set(
    chatId,
    setTimeout(() => {
      saveTimers.delete(chatId)
      const pending = flushChatTrace(chatId).finally(() => {
        flushInFlight.delete(pending)
      })
      flushInFlight.add(pending)
    }, SAVE_DEBOUNCE_MS)
  )
}

async function flushChatTrace(chatId: string): Promise<void> {
  const events = traceCaches.get(chatId)
  if (!events) return

  const dir = chatTracesDir()
  await mkdir(dir, { recursive: true })
  const payload: ChatTraceFile = {
    chatId,
    updatedAt: Date.now(),
    events
  }
  await writeJsonAtomic(chatTracePath(chatId), payload)
}

/** Все события трейса всех чатов с диска (без кэша — для агрегации метрик). */
export async function loadAllChatTraceEventsFromDisk(): Promise<AgentTraceEvent[]> {
  const dir = chatTracesDir()
  let files: string[] = []
  try {
    files = await readdir(dir)
  } catch {
    return []
  }

  const all: AgentTraceEvent[] = []
  for (const file of files) {
    if (!file.endsWith('.json')) continue
    const chatId = file.slice(0, -'.json'.length)
    const events = await loadChatTraceFromDisk(chatId)
    all.push(...events)
  }
  return all
}

export async function loadChatTrace(chatId: string): Promise<AgentTraceEvent[]> {
  if (!chatId.trim()) return []
  const events = await ensureTraceCache(chatId)
  return [...events]
}

export function appendChatTraceEvent(chatId: string, event: AgentTraceEvent): Promise<void> {
  if (!chatId.trim()) return Promise.resolve()

  return (async () => {
    const list = await ensureTraceCache(chatId)
    list.push(event)
    if (list.length > MAX_EVENTS) list.splice(0, list.length - MAX_EVENTS)
    scheduleChatTraceSave(chatId)
  })()
}

export async function clearChatTrace(chatId: string): Promise<void> {
  if (!chatId.trim()) return

  const timer = saveTimers.get(chatId)
  if (timer) {
    clearTimeout(timer)
    saveTimers.delete(chatId)
  }

  traceCaches.set(chatId, [])
  loadPromises.delete(chatId)
  await unlink(chatTracePath(chatId)).catch(() => {})
}

export async function flushPendingChatTraceWrites(): Promise<void> {
  const chatIds = [...saveTimers.keys()]
  for (const chatId of chatIds) {
    const timer = saveTimers.get(chatId)
    if (timer) clearTimeout(timer)
    saveTimers.delete(chatId)
    const pending = flushChatTrace(chatId).finally(() => {
      flushInFlight.delete(pending)
    })
    flushInFlight.add(pending)
    await pending
  }
  await Promise.all([...loadPromises.values()])
  await Promise.all([...flushInFlight])
}

export async function exportAgentTrace(
  chatId: string,
  events: AgentTraceEvent[],
  projectPath?: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!chatId.trim()) {
    return { ok: false, error: 'Чат не выбран' }
  }
  try {
    const tracesDir = getAgentTracesDir()
    await mkdir(tracesDir, { recursive: true })
    const filePath = join(tracesDir, `${Date.now()}.json`)
    const payload = {
      traceSchemaVersion: AGENT_TRACE_SCHEMA_VERSION,
      chatId,
      ...(projectPath?.trim() ? { projectPath: projectPath.trim() } : {}),
      exportedAt: Date.now(),
      events
    }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, path: filePath }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
