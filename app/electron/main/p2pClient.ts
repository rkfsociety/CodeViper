import type { AgentSettings } from '../../src/types'
import { P2P_MAX_CONCURRENT_TASKS, P2P_QUEUE_WAIT_TIMEOUT_MS } from '../../shared/constants'
import { getP2pLoadPauseReason } from './systemStats'

export interface P2PRegisterResult {
  ok: boolean
  id?: string
  message: string
}

export interface P2pIncomingTask {
  id: string
  prompt: string
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

/**
 * Проверяет, можно ли принять входящую P2P-задачу (нагрузка CPU/GPU).
 * Вызывается перед запуском инференса на этом узле.
 */
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

/**
 * Резерв слота + проверки перед выполнением P2P-задачи.
 */
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

/**
 * Регистрирует этот узел на P2P сигнальном сервере.
 * Вызывается при включении тумблера «Поделиться мощностью».
 */
export async function registerNode(settings: AgentSettings): Promise<P2PRegisterResult> {
  const url = settings.p2pServerUrl?.trim()
  if (!url) return { ok: false, message: 'p2pServerUrl не задан в настройках' }
  if (!settings.p2pAuthToken?.trim())
    return { ok: false, message: 'p2pAuthToken не задан в настройках' }

  const endpoint = settings.ollamaUrl ?? 'http://127.0.0.1:11434'
  const model = settings.model ?? ''

  if (!model) return { ok: false, message: 'модель не выбрана в настройках' }

  const body = JSON.stringify({ endpoint, model })

  try {
    const res = await fetch(`${url}/nodes/register`, {
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
    return { ok: true, id: data.id, message: 'узел зарегистрирован' }
  } catch (e) {
    return { ok: false, message: `ошибка сети: ${(e as Error).message}` }
  }
}
