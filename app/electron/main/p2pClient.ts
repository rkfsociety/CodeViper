import type { AgentSettings } from '../../src/types'

export interface P2PRegisterResult {
  ok: boolean
  id?: string
  message: string
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
