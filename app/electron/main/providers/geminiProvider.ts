import { randomUUID } from 'crypto'
import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import {
  GEMINI_ANY_MODE_MAX_TOOLS,
  GEMINI_API_BASE_URL,
  resolveGeminiModelId
} from '../../../shared/constants'
import { simplifySchemaForGemini } from '../../../shared/geminiToolSchema'
import { StreamingChatProvider, type ChunkParser, type FetchInit } from './streamingChatProvider'

// ── Gemini REST types ──────────────────────────────────────────────────────────

interface GeminiPart {
  text?: string
  thought?: boolean
  inlineData?: { mimeType: string; data: string }
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

export class GeminiProvider extends StreamingChatProvider implements ModelProvider {
  /** Backoff при 429: по умолчанию 35 с → 60 с → 90 с (Gemini free tier). */
  protected override readonly BACKOFF_MS = [35_000, 60_000, 90_000]

  private rateLimiter: RateLimiter

  constructor(
    private apiKey: string,
    modelName: string,
    private baseUrl: string = GEMINI_API_BASE_URL,
    rpm = 5
  ) {
    super()
    this.modelName = resolveGeminiModelId(modelName)
    this.rateLimiter = new RateLimiter(rpm)
  }

  private modelName: string

  /** Ждём слот rate limiter, затем делегируем стриминг базовому классу. */
  override async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    await this.rateLimiter.waitForSlot()
    yield* super.chat(options)
  }

  protected override buildRequest(options: ChatOptions): { url: string; init: FetchInit } {
    const modelName = resolveGeminiModelId(options.model || this.modelName)
    const isThinkingModel = /2\.5|3(\.|$)/.test(modelName)
    const body = this.buildBody(options, isThinkingModel)
    const url = `${this.baseUrl}/models/${modelName}:streamGenerateContent?key=${encodeURIComponent(this.apiKey)}&alt=sse`

    return {
      url,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    }
  }

  protected override createChunkParser(options: ChatOptions): ChunkParser {
    const modelName = resolveGeminiModelId(options.model || this.modelName)
    const toolCalls: ChatChunk['tool_calls'] = []
    let totalTokens: number | undefined

    return {
      parse(line: string): ChatChunk | null {
        if (!line.startsWith('data: ')) return null
        const raw = line.slice(6).trim()
        if (!raw || raw === '[DONE]') return null

        let chunk: GeminiChunk
        try {
          chunk = JSON.parse(raw) as GeminiChunk
        } catch {
          return null
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
            toolCalls!.push({
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
          return { content: text, thinking: thinking || undefined, model: modelName }
        }

        return null
      },

      finalize(): ChatChunk[] {
        if (toolCalls!.length || totalTokens !== undefined) {
          return [
            {
              content: '',
              tool_calls: toolCalls!.length ? toolCalls : undefined,
              model: modelName,
              total_tokens: totalTokens
            }
          ]
        }
        return []
      }
    }
  }

  /**
   * Если Retry-After явно присутствует в заголовке или теле — использует его.
   * Иначе падает обратно на стандартный BACKOFF_MS (чтобы тесты с BACKOFF_MS=[0] работали).
   */
  protected override async resolveRetryDelayMs(
    attempt: number,
    response: Response,
    body: string
  ): Promise<number> {
    const retryAfterSec = this.parseRetryAfterExplicit(response, body)
    if (retryAfterSec !== null) return retryAfterSec * 1_000
    const jitter = Math.floor(Math.random() * 200)
    return this.BACKOFF_MS[attempt]! + jitter
  }

  protected override handleHttpError(status: number, body: string): never {
    if (status === 429) {
      const match = body.match(/retry in ([\d.]+)\s*s(?:ec(?:onds?)?)?/i)
      const seconds = match ? Math.ceil(parseFloat(match[1])) : 35
      throw new Error(
        `Превышен лимит запросов Gemini API. Подожди ${seconds} сек. и попробуй снова.`
      )
    }
    throw new Error(`Gemini API error ${status}: ${body}`)
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

  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private modelsUrl(): string {
    return `${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`
  }

  /** Возвращает секунды из Retry-After заголовка или тела, или null если не найдено. */
  private parseRetryAfterExplicit(
    res: { headers: { get(name: string): string | null } },
    body: string
  ): number | null {
    const retryAfterHeader = res.headers.get('retry-after')
    if (retryAfterHeader) {
      const seconds = parseInt(retryAfterHeader, 10)
      if (!isNaN(seconds)) return Math.max(seconds, 1)
    }

    const match = body.match(/retry in ([\d.]+)\s*s(?:ec(?:onds?)?)?/i)
    if (match) {
      const seconds = parseFloat(match[1])
      return Math.max(Math.ceil(seconds), 1)
    }

    return null
  }

  private buildBody(options: ChatOptions, isThinkingModel: boolean): GeminiRequest {
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
    const lastParts: GeminiPart[] = []
    if (lastText) lastParts.push({ text: lastText })
    for (const img of lastMsg?.images ?? []) {
      const match = img.dataUrl.match(/^data:([^;]+);base64,(.+)$/)
      if (match) lastParts.push({ inlineData: { mimeType: match[1], data: match[2] } })
    }
    const contents: GeminiContent[] = [
      ...history,
      { role: 'user', parts: lastParts.length ? lastParts : [{ text: '' }] }
    ]

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
            parameters: simplifySchemaForGemini(t.input_schema)
          }))
        }
      ]
      let mode: 'AUTO' | 'ANY' = options.tool_choice === 'required' ? 'ANY' : 'AUTO'
      if (mode === 'ANY' && options.tools.length > GEMINI_ANY_MODE_MAX_TOOLS) {
        mode = 'AUTO'
      }
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
