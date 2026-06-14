import { modelsMatch } from '../../shared/modelRouter'

export interface OllamaLoadedModel {
  name: string
  size?: number
}

export async function listLoadedOllamaModels(baseUrl: string): Promise<OllamaLoadedModel[]> {
  try {
    const res = await fetch(`${baseUrl}/api/ps`)
    if (!res.ok) return []

    const data = (await res.json()) as {
      models?: Array<{ name: string; size?: number; size_vram?: number }>
    }

    return (data.models ?? []).map((item) => ({
      name: item.name,
      size: item.size_vram ?? item.size
    }))
  } catch {
    return []
  }
}

export async function unloadOllamaModel(baseUrl: string, model: string): Promise<void> {
  const res = await fetch(`${baseUrl}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: '',
      stream: false,
      keep_alive: 0
    })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama unload ${model}: ${res.status} ${text}`)
  }
}

export async function prepareOllamaModel(
  baseUrl: string,
  targetModel: string
): Promise<{ unloaded: string[] }> {
  const loaded = await listLoadedOllamaModels(baseUrl)
  const unloaded: string[] = []

  for (const item of loaded) {
    if (modelsMatch(item.name, targetModel)) continue
    try {
      await unloadOllamaModel(baseUrl, item.name)
      unloaded.push(item.name)
    } catch {
      // выгрузка необязательна — Ollama освободит память при переключении
    }
  }

  return { unloaded }
}

export function formatModelSwitchMessage(
  model: string,
  reason: string,
  unloaded: string[]
): string {
  const parts = [`🤖 Авто-модель: ${model}`, reason]
  if (unloaded.length) {
    parts.push(`Выгружено из RAM: ${unloaded.join(', ')}`)
  }
  return parts.join('\n')
}
