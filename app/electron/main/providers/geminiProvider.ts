import { randomUUID } from 'crypto'
import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { GEMINI_API_BASE_URL } from '../../../shared/constants'

// ── Gemini REST types ──────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  thought?: boolean
  functionCall?: { id?: string; name: string; args?: Record<string, unknown> }
  functionResponse?: { id?: string; name: string; response: Record<string, unknown> }
}

interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

interface GeminiRequest {
  contents: GeminiContent[]
  systemInstruction?: { parts: [{ text: string }] }
  tools?: Array<{ functionDeclarations: unknown[] }>
  toolConfig?: { functionCallingConfig: { mode: 'AUTO' | 'ANY' | 'NONE' } }
  generationConfig?: {
    temperature?: number
    maxOutputTokens?: number
    thinkingConfig?: { includeThoughts: boolean; thinkingBudget?: number }
  }
}

interface GeminiChunk {
  candidates?: Array<{
    content?: { parts?: GeminiPart[] }
    finishReason?: string
  }>
  usageMetadata?: { totalTokenCount?: number }
}

// ── Rate Limiter ──────────────────────────────────────────────────────────────

class RateLimiter {
  private lastRequestTime = 0
  private minIntervalMs: number

  constructor(rpm: number) {
    // Добавляем 10% запас чтобы не попасть в окно между запросами
    this.minIntervalMs = Math.ceil((60 / rpm) * 1000 * 1.1)
  }

  async waitForSlot(): Promise<void> {
    const now = Date.now()
    const timeSinceLastRequest = now - this.lastRequestTime
    const delayNeeded = this.minIntervalMs - timeSinceLastRequest

    if (delayNeeded > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayNeeded))
    }

    this.lastRequestTime = Date.now()
  }
}

// ── Provider ───────────────────────────────────────────────────────────────────

export class GeminiProvider implements ModelProvider {
  private rateLimiter: RateLimiter

  constructor(
    private apiKey: string,
    private modelName: string,
    private baseUrl: string = GEMINI_API_BASE_URL,
    rpm = 5
  ) {
    this.rateLimiter = new RateLimiter(rpm)
  }

  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      await this.rateLimiter.waitForSlot()
      const res = await fetch(this.modelsUrl(), {
        signal: signal ?? AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      await this.rateLimiter.waitForSlot()
      const res = await fetch(`${this.modelsUrl()}&pageSize=100`)
      if (!res.ok) return []

      const data = (await res.json()) as {
        models?: Array<{
          name?: string
          supportedGenerationMethods?: string[]
          inputTokenLimit?: number
        }>
      }

      return (data.models ?? [])
        .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
        .map((m) => ({
          name: (m.name ?? '').replace(/^models\//, ''),
          contextLength: m.inputTokenLimit
        }))
        .filter((m) => m.name)
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const modelName = options.model || this.modelName
    const isThinkingModel = /2\.5/.test(modelName)

    const body = this.buildRequest(options, isThinkingModel)
    const url = `${this.baseUrl}/models/${modelName}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`

    // Exponential backoff для обработки rate limits (429)
    let lastError: Error | null = null
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await this.rateLimiter.waitForSlot()

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: options.signal
        })

        if (res.status === 429) {
          const retryAfter = this.parseRetryAfter(res, await res.text())
          if (attempt < 2) {
            await new Promise((resolve) => setTimeout(resolve, retryAfter * 1_000))
            continue
          }
          throw new Error(
            `Превышен лимит запросов Gemini API. Подожди ${Math.ceil(retryAfter)} сек. и попробуй снова.`
          )
        }

        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText)
          throw new Error(`Gemini API error ${res.status}: ${err}`)
        }

        // Success
        yield* this.processStream(res, modelName)
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        if (!(error instanceof Error) || !error.message.includes('429')) {
          throw lastError
        }
        // Continue retry loop on 429
      }
    }

    if (lastError) throw lastError
  }

  private parseRetryAfter(res: any, body: string): number {
    // Проверяем заголовок Retry-After
    const retryAfterHeader = res.headers.get('retry-after')
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10)
      if (!isNaN(seconds)) return Math.max(seconds, 1)
    }

    // Пытаемся извлечь из сообщения об ошибке Gemini: "retry in 60s" или "retry in 60 seconds"
    const match = body.match(/retry in ([\d.]+)\s*s(?:ec(?:onds?)?)?/i)
    if (match) {
      const seconds = parseFloat(match[1])
      return Math.max(Math.ceil(seconds), 1)
    }

    // Default: 35 секунд (стандартный free tier limit)
    return 35
  }

  private async *processStream(res: any, modelName: string): AsyncGenerator<ChatChunk> {
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    const toolCalls: ChatChunk['tool_calls'] = []
    let totalTokens: number | undefined

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') continue

        let chunk: GeminiChunk
        try {
          chunk = JSON.parse(raw) as GeminiChunk
        } catch {
          continue
        }

        if (chunk.usageMetadata?.totalTokenCount) {
          totalTokens = chunk.usageMetadata.totalTokenCount
        }

        const parts = chunk.candidates?.[0]?.content?.parts ?? []
        let text = ''
        let thinking = ''

        for (const part of parts) {
          if (part.thought && part.text) {
            thinking += part.text
          } else if (part.text) {
            text += part.text
          } else if (part.functionCall?.name) {
            const id = part.functionCall.id ?? randomUUID()
            toolCalls.push({
              id,
              type: 'function' as const,
              function: {
                name: part.functionCall.name,
                arguments: JSON.stringify(part.functionCall.args ?? {})
              }
            })
          }
        }

        if (text || thinking) {
          yield {
            content: text,
            thinking: thinking || undefined,
            model: modelName
          }
        }
      }
    }

    // Финальный чанк: tool calls + токены
    if (toolCalls.length || totalTokens !== undefined) {
      yield {
        content: '',
        tool_calls: toolCalls.length ? toolCalls : undefined,
        model: modelName,
        total_tokens: totalTokens
      }
    }
  }

  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private modelsUrl(): string {
    return `${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`
  }

  private buildRequest(options: ChatOptions, isThinkingModel: boolean): GeminiRequest {
    const systemText = options.messages
      .filter((m) => m.role === 'system' && m.content)
      .map((m) => m.content)
      .join('\n')
      .trim()

    const toolNameById = new Map<string, string>()
    const history: GeminiContent[] = []
    const nonSystem = options.messages.filter((m) => m.role !== 'system')

    for (let i = 0; i < nonSystem.length - 1; i++) {
      const msg = nonSystem[i]

      if (msg.role === 'assistant') {
        const parts: GeminiPart[] = []
        if (msg.content) parts.push({ text: msg.content })
        for (const call of msg.tool_calls ?? []) {
          toolNameById.set(call.id, call.function.name)
          parts.push({
            functionCall: {
              id: call.id,
              name: call.function.name,
              args: safeJsonParse(call.function.arguments)
            }
          })
        }
        if (parts.length) history.push({ role: 'model', parts })
        continue
      }

      if (msg.role === 'tool') {
        const name = toolNameById.get(msg.tool_call_id ?? '') || 'tool'
        history.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                id: msg.tool_call_id,
                name,
                response: safeJsonParse(msg.content ?? '{}')
              }
            }
          ]
        })
        continue
      }

      if (msg.content) {
        history.push({ role: 'user', parts: [{ text: msg.content }] })
      }
    }

    const lastMsg = nonSystem.at(-1)
    const lastText = lastMsg?.content ?? ''
    const contents: GeminiContent[] = [...history, { role: 'user', parts: [{ text: lastText }] }]

    const req: GeminiRequest = { contents }

    if (systemText) {
      req.systemInstruction = { parts: [{ text: systemText }] }
    }

    if (options.tools?.length) {
      req.tools = [
        {
          functionDeclarations: options.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.input_schema
          }))
        }
      ]
      const mode = options.tool_choice === 'required' ? 'ANY' : 'AUTO'
      req.toolConfig = { functionCallingConfig: { mode } }
    }

    const genConfig: GeminiRequest['generationConfig'] = {}
    if (options.temperature !== undefined) genConfig.temperature = options.temperature
    if (options.max_tokens !== undefined) genConfig.maxOutputTokens = options.max_tokens
    if (isThinkingModel) {
      genConfig.thinkingConfig = { includeThoughts: true }
    }
    if (Object.keys(genConfig).length) req.generationConfig = genConfig

    return req
  }
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { value }
  }
}
