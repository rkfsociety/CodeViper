export interface TrainingExample {
  user: string
  assistant: string
}

const MAX_EXAMPLES_IN_MODELFILE = 48

function normalizeExample(item: Record<string, unknown>): TrainingExample | null {
  const user = String(item.user ?? item.prompt ?? item.input ?? item.question ?? '').trim()
  const assistant = String(
    item.assistant ?? item.response ?? item.output ?? item.answer ?? ''
  ).trim()
  if (!user || !assistant) return null
  return { user, assistant }
}

export function parseTrainingData(raw: string): TrainingExample[] {
  const trimmed = raw.trim()
  if (!trimmed) return []

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => normalizeExample(item as Record<string, unknown>))
        .filter((item): item is TrainingExample => item !== null)
    }
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      const list = obj.examples ?? obj.data ?? obj.items
      if (Array.isArray(list)) {
        return list
          .map((item) => normalizeExample(item as Record<string, unknown>))
          .filter((item): item is TrainingExample => item !== null)
      }
    }
  } catch {
    // JSONL или текст ниже
  }

  const examples: TrainingExample[] = []
  for (const line of trimmed.split('\n')) {
    const row = line.trim()
    if (!row) continue
    try {
      const item = JSON.parse(row) as Record<string, unknown>
      const example = normalizeExample(item)
      if (example) examples.push(example)
    } catch {
      continue
    }
  }

  return examples
}

export function buildModelfile(input: {
  baseModel: string
  system?: string
  examples: TrainingExample[]
  temperature?: number
}): string {
  const baseModel = input.baseModel.trim()
  if (!baseModel) throw new Error('Укажите base_model (FROM)')

  const lines = [`FROM ${baseModel}`]

  if (input.temperature !== undefined && !Number.isNaN(input.temperature)) {
    lines.push('', `PARAMETER temperature ${input.temperature}`)
  }

  const system = input.system?.trim()
  if (system) {
    lines.push('', 'SYSTEM', system)
  }

  for (const example of input.examples.slice(0, MAX_EXAMPLES_IN_MODELFILE)) {
    lines.push('', `MESSAGE user ${example.user}`, `MESSAGE assistant ${example.assistant}`)
  }

  return lines.join('\n')
}

export async function createOllamaModelFromModelfile(
  baseUrl: string,
  modelName: string,
  modelfile: string,
  signal?: AbortSignal
): Promise<{ status: string }> {
  const url = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${url}/api/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: modelName.trim(),
      modelfile,
      stream: false
    }),
    signal
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama create: ${res.status} ${text}`)
  }

  const data = (await res.json()) as { status?: string }
  return { status: data.status ?? 'success' }
}

export async function prepareModelFromTrainingFile(input: {
  baseUrl: string
  baseModel: string
  modelName: string
  trainingRaw: string
  system?: string
  temperature?: number
  signal?: AbortSignal
}): Promise<{ modelfile: string; exampleCount: number; status: string }> {
  const examples = parseTrainingData(input.trainingRaw)
  if (!examples.length) {
    throw new Error(
      'В файле нет примеров. Формат: JSON-массив [{user, assistant}] или JSONL (по строке на пример).'
    )
  }

  const modelfile = buildModelfile({
    baseModel: input.baseModel,
    system: input.system,
    examples,
    temperature: input.temperature
  })

  const result = await createOllamaModelFromModelfile(
    input.baseUrl,
    input.modelName,
    modelfile,
    input.signal
  )

  return {
    modelfile,
    exampleCount: Math.min(examples.length, MAX_EXAMPLES_IN_MODELFILE),
    status: result.status
  }
}
