import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import type { AgentSettings } from '../../src/types'
import { P2P_MAX_CONCURRENT_TASKS, P2P_QUEUE_WAIT_TIMEOUT_MS } from '../../shared/constants'
import {
  decryptP2pPrompt,
  encryptP2pPrompt,
  generateP2pNodeKeys,
  toP2pWssSubscribeUrl,
  toSecureP2pUrl,
  type P2pEncryptedPayload,
  type P2pNodeKeys
} from '../../shared/p2pCrypto'
import { getP2pLoadPauseReason } from './systemStats'

export type { P2pEncryptedPayload, P2pNodeKeys }

export interface P2PRegisterResult {
  ok: boolean
  id?: string
  message: string
  /** Новая пара ключей — сохранить в настройках при первой регистрации */
  nodeKeys?: P2pNodeKeys
}

export interface P2pIncomingTask {
  id: string
  prompt?: string
  encrypted?: P2pEncryptedPayload
}

export interface P2pAcceptResult {
  accepted: boolean
  paused: boolean
  message: string
  /** HTTP-код для ответа вызывающей стороне (например 503 при переполнении очереди) */
  statusCode?: number
}

export interface P2pSlotAcquireResult {
  acquired: boolean
  message: string
  statusCode?: number
}

interface QueueWaiter {
  taskId: string
  resolve: (result: P2pSlotAcquireResult) => void
  timer: ReturnType<typeof setTimeout>
}

let activeP2pTaskCount = 0
const p2pTaskWaitQueue: QueueWaiter[] = []

function grantP2pTaskSlot(): void {
  activeP2pTaskCount++
}

/** Сброс состояния очереди (только для unit-тестов). */
export function resetP2pTaskQueueForTests(): void {
  for (const waiter of p2pTaskWaitQueue) {
    clearTimeout(waiter.timer)
    waiter.resolve({
      acquired: false,
      statusCode: 503,
      message: 'очередь сброшена (тест)'
    })
  }
  p2pTaskWaitQueue.length = 0
  activeP2pTaskCount = 0
}

/** Статистика очереди (для тестов и отладки). */
export function getP2pTaskQueueStats(): { active: number; queued: number } {
  return { active: activeP2pTaskCount, queued: p2pTaskWaitQueue.length }
}

export function ensureP2pNodeKeys(settings: AgentSettings): {
  keys: P2pNodeKeys
  generated: boolean
} {
  const privateKey = settings.p2pNodePrivateKey?.trim()
  const publicKey = settings.p2pNodePublicKey?.trim()
  if (privateKey && publicKey) {
    return { keys: { privateKey, publicKey }, generated: false }
  }
  const keys = generateP2pNodeKeys()
  return { keys, generated: true }
}

/** Расшифровать промпт входящей задачи (ECDH + AES-GCM). */
export function resolveP2pTaskPrompt(task: P2pIncomingTask, settings: AgentSettings): string {
  if (task.encrypted) {
    const privateKey = settings.p2pNodePrivateKey?.trim()
    if (!privateKey) {
      throw new Error('p2pNodePrivateKey не задан — невозможно расшифровать P2P-задачу')
    }
    return decryptP2pPrompt(task.encrypted, privateKey)
  }
  return task.prompt ?? ''
}

/** Зашифровать промпт для узла-получателя по его публичному ключу. */
export function encryptPromptForP2pNode(
  prompt: string,
  recipientPublicKeyB64: string
): P2pEncryptedPayload {
  return encryptP2pPrompt(prompt, recipientPublicKeyB64)
}

/**
 * Отправить зашифрованную задачу через сигнальный сервер (HTTPS/TLS).
 * Сервер ретранслирует только ciphertext по WSS.
 */
export async function relayEncryptedP2pTask(
  settings: AgentSettings,
  targetNodeId: string,
  recipientPublicKeyB64: string,
  prompt: string,
  taskId?: string
): Promise<{ ok: boolean; message: string; taskId: string }> {
  const url = settings.p2pServerUrl?.trim()
  if (!url) return { ok: false, message: 'p2pServerUrl не задан', taskId: taskId ?? '' }
  if (!settings.p2pAuthToken?.trim()) {
    return { ok: false, message: 'p2pAuthToken не задан', taskId: taskId ?? '' }
  }

  const id = taskId ?? randomUUID()
  const payload = encryptP2pPrompt(prompt, recipientPublicKeyB64)
  const secureUrl = `${toSecureP2pUrl(url)}/tasks/relay`

  try {
    const res = await fetch(secureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.p2pAuthToken.trim()}`
      },
      body: JSON.stringify({ taskId: id, targetNodeId, payload }),
      signal: AbortSignal.timeout(15_000)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, message: `relay ${res.status}: ${text.slice(0, 200)}`, taskId: id }
    }

    return { ok: true, message: 'задача передана (шифротекст)', taskId: id }
  } catch (e) {
    return { ok: false, message: `ошибка relay: ${(e as Error).message}`, taskId: id }
  }
}

export type P2pWssTaskHandler = (task: P2pIncomingTask) => void

/**
 * Подписка узла на входящие P2P-задачи по WSS (TLS при https:// сервере).
 * В сообщениях только зашифрованное тело — расшифровка на стороне узла.
 */
export function subscribeP2pTaskWss(
  settings: AgentSettings,
  nodeId: string,
  onTask: P2pWssTaskHandler
): WebSocket | null {
  const baseUrl = settings.p2pServerUrl?.trim()
  const token = settings.p2pAuthToken?.trim()
  if (!baseUrl || !token || !nodeId) return null

  const wssUrl = toP2pWssSubscribeUrl(baseUrl, nodeId, token)
  const socket = new WebSocket(wssUrl, { rejectUnauthorized: true })

  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data)) as {
        type?: string
        taskId?: string
        payload?: P2pEncryptedPayload
      }
      if (msg.type === 'task' && msg.taskId && msg.payload) {
        onTask({ id: msg.taskId, encrypted: msg.payload })
      }
    } catch {
      /* ignore malformed frames */
    }
  })

  return socket
}

/**
 * Занять слот для входящей P2P-задачи.
 * До {@link P2P_MAX_CONCURRENT_TASKS} задач параллельно; остальные ждут в очереди до 60 с.
 */
export function acquireP2pTaskSlot(taskId: string): Promise<P2pSlotAcquireResult> {
  if (activeP2pTaskCount < P2P_MAX_CONCURRENT_TASKS) {
    grantP2pTaskSlot()
    return Promise.resolve({ acquired: true, message: 'слот получен' })
  }

  return new Promise((resolve) => {
    const waiter: QueueWaiter = {
      taskId,
      resolve,
      timer: setTimeout(() => {
        const idx = p2pTaskWaitQueue.indexOf(waiter)
        if (idx >= 0) p2pTaskWaitQueue.splice(idx, 1)
        resolve({
          acquired: false,
          statusCode: 503,
          message: `лимит ${P2P_MAX_CONCURRENT_TASKS} задач: ожидание в очереди превысило ${P2P_QUEUE_WAIT_TIMEOUT_MS / 1000} с`
        })
      }, P2P_QUEUE_WAIT_TIMEOUT_MS)
    }
    p2pTaskWaitQueue.push(waiter)
  })
}

/** Освободить слот после завершения P2P-задачи; передать слот следующему в очереди. */
export function releaseP2pTaskSlot(): void {
  if (p2pTaskWaitQueue.length > 0) {
    const next = p2pTaskWaitQueue.shift()!
    clearTimeout(next.timer)
    next.resolve({ acquired: true, message: 'слот получен из очереди' })
    return
  }

  activeP2pTaskCount = Math.max(0, activeP2pTaskCount - 1)
}

export async function tryAcceptIncomingP2pTask(
  settings: AgentSettings,
  _task: P2pIncomingTask
): Promise<P2pAcceptResult> {
  if (!settings.shareCompute) {
    return {
      accepted: false,
      paused: false,
      message: 'Режим «Поделиться мощностью» выключен'
    }
  }

  const pauseReason = await getP2pLoadPauseReason()
  if (pauseReason) {
    return {
      accepted: false,
      paused: true,
      message: `P2P на паузе: ${pauseReason}`
    }
  }

  return { accepted: true, paused: false, message: 'можно принять задачу' }
}

export async function reserveIncomingP2pTask(
  settings: AgentSettings,
  task: P2pIncomingTask
): Promise<P2pAcceptResult> {
  const accept = await tryAcceptIncomingP2pTask(settings, task)
  if (!accept.accepted) return accept

  const slot = await acquireP2pTaskSlot(task.id)
  if (!slot.acquired) {
    return {
      accepted: false,
      paused: false,
      statusCode: slot.statusCode ?? 503,
      message: slot.message
    }
  }

  return { accepted: true, paused: false, message: 'слот зарезервирован' }
}

export async function registerNode(settings: AgentSettings): Promise<P2PRegisterResult> {
  const url = settings.p2pServerUrl?.trim()
  if (!url) return { ok: false, message: 'p2pServerUrl не задан в настройках' }
  if (!settings.p2pAuthToken?.trim())
    return { ok: false, message: 'p2pAuthToken не задан в настройках' }

  const endpoint = settings.ollamaUrl ?? 'http://127.0.0.1:11434'
  const model = settings.model ?? ''

  if (!model) return { ok: false, message: 'модель не выбрана в настройках' }

  const { keys, generated } = ensureP2pNodeKeys(settings)
  const secureUrl = `${toSecureP2pUrl(url)}/nodes/register`
  const body = JSON.stringify({
    endpoint: toSecureP2pUrl(endpoint),
    model,
    publicKey: keys.publicKey
  })

  try {
    const res = await fetch(secureUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.p2pAuthToken.trim()}`
      },
      body,
      signal: AbortSignal.timeout(10_000)
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, message: `сервер вернул ${res.status}: ${text.slice(0, 200)}` }
    }

    const data = (await res.json()) as { ok: boolean; id?: string }
    return {
      ok: true,
      id: data.id,
      message: 'узел зарегистрирован',
      ...(generated ? { nodeKeys: keys } : {})
    }
  } catch (e) {
    return { ok: false, message: `ошибка сети: ${(e as Error).message}` }
  }
}
