import { assertPullableToolModel } from '../../shared/recommendedModels'
import { readNdjsonLines } from './ndjson'

export async function fetchOllamaModels(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error('Ollama недоступна')
  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>
  }
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at
  }))
}

export async function fetchOllamaModelsWithDetails(baseUrl: string) {
  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error('Ollama недоступна')
  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>
  }

  const models = data.models ?? []
  const detailed = await Promise.all(
    models.map(async (m) => {
      try {
        const detRes = await fetch(`${url}/api/show`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: m.name }),
          signal: AbortSignal.timeout(5_000)
        })
        if (detRes.ok) {
          const body = (await detRes.json()) as {
            details?: { parameter_size?: string; context_length?: number }
            capabilities?: string[]
          }
          return {
            name: m.name,
            size: m.size,
            modifiedAt: m.modified_at,
            details: body.details,
            capabilities: body.capabilities
          }
        }
      } catch {
        // пропускаем
      }
      return { name: m.name, size: m.size, modifiedAt: m.modified_at }
    })
  )
  return detailed
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5_000) })
    return res.ok
  } catch {
    return false
  }
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void
): Promise<void> {
  assertPullableToolModel(model)
  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama pull: ${res.status} ${text}`)
  }
  if (!res.body) throw new Error('Ollama: пустой ответ при скачивании')

  let lastCompletedDigest: string | undefined

  for await (const chunk of readNdjsonLines(res.body)) {
    const progress: OllamaPullProgress = {
      status: String(chunk.status ?? ''),
      digest: chunk.digest as string | undefined,
      total: chunk.total as number | undefined,
      completed: chunk.completed as number | undefined
    }
    if (
      progress.digest &&
      progress.total &&
      progress.total > 0 &&
      progress.total === progress.completed
    ) {
      lastCompletedDigest = progress.digest
    }
    onProgress(progress)
  }

  if (lastCompletedDigest) {
    await verifyOllamaModelDigest(url, model, lastCompletedDigest)
  }
}

export async function verifyOllamaModelDigest(
  baseUrl: string,
  model: string,
  expectedDigest: string
): Promise<void> {
  const url = baseUrl.replace(/\/$/, '')
  let showDigest: string | undefined

  try {
    const res = await fetch(`${url}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: model }),
      signal: AbortSignal.timeout(10_000)
    })
    if (res.ok) {
      const data = (await res.json()) as { digest?: string }
      showDigest = data.digest
    }
  } catch {
    // Ollama недоступна или старая версия — пропускаем проверку
    return
  }

  if (!showDigest) return

  if (showDigest !== expectedDigest) {
    try {
      await deleteOllamaModel(url, model)
    } catch {
      // best-effort
    }
    throw new Error(
      `SHA-256 модели не совпадает: ожидался ${expectedDigest}, получен ${showDigest} — файл удалён`
    )
  }
}

export async function deleteOllamaModel(baseUrl: string, model: string): Promise<void> {
  const trimmed = model.trim()
  if (!trimmed) throw new Error('Укажите имя модели для удаления')
  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: trimmed }),
    signal: AbortSignal.timeout(15_000)
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama delete: ${res.status} ${text}`)
  }
}
