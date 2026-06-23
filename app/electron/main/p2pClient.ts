import type { AgentSettings } from '../../src/types'
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
