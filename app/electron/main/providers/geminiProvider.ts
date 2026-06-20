import { randomUUID } from 'crypto'
import { GoogleGenerativeAI } from '@google/generative-ai'
import type {
  ModelProvider,
  ChatOptions,
  ChatChunk,
  LoadedModel,
  ModelPlacement
} from '../../../shared/modelProvider'
import { GEMINI_API_BASE_URL } from '../../../shared/constants'

type GeminiPart = {
  text?: string
  functionCall?: { name?: string; args?: Record<string, unknown>; id?: string }
  functionResponse?: { name?: string; response?: Record<string, unknown>; id?: string }
}

type GeminiContent = {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export class GeminiProvider implements ModelProvider {
  private genAI: GoogleGenerativeAI

  constructor(
    private apiKey: string,
    private modelName: string,
    private baseUrl: string = GEMINI_API_BASE_URL
  ) {
    this.genAI = new GoogleGenerativeAI(apiKey)
  }

  async ping(signal?: AbortSignal): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`, {
        signal: signal || AbortSignal.timeout(5_000)
      })
      return res.ok
    } catch {
      return false
    }
  }

  async listModels(): Promise<LoadedModel[]> {
    try {
      const res = await fetch(`${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}`)
      if (!res.ok) return []

      const data = (await res.json()) as { models?: Array<{ name?: string }> }
      return (data.models ?? [])
        .map((model) => model.name || '')
        .filter(Boolean)
        .map((name) => ({ name }))
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const model = this.genAI.getGenerativeModel({
      model: options.model || this.modelName,
      tools: options.tools?.length
        ? ([
            {
              functionDeclarations: options.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                parameters: tool.input_schema as any
              }))
            }
          ] as any)
        : undefined
    } as any)

    const systemMessages = options.messages.filter((msg) => msg.role === 'system' && msg.content)
    const systemInstruction = systemMessages
      .map((msg) => msg.content)
      .join('\n')
      .trim()

    const toolNameById = new Map<string, string>()
    const history: GeminiContent[] = []

    for (const msg of options.messages) {
      if (msg.role === 'system') continue

      if (msg.role === 'assistant') {
        const parts: GeminiPart[] = []
        if (msg.content) parts.push({ text: msg.content })
        for (const call of msg.tool_calls ?? []) {
          toolNameById.set(call.id, call.function.name)
          parts.push({
            functionCall: {
              name: call.function.name,
              args: safeJsonParse(call.function.arguments),
              id: call.id
            }
          })
        }
        if (parts.length) history.push({ role: 'model', parts })
        continue
      }

      if (msg.role === 'tool') {
        history.push({
          role: 'user',
          parts: [
            {
              functionResponse: {
                name: toolNameById.get(msg.tool_call_id ?? '') || 'tool',
                id: msg.tool_call_id,
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

    const chat = model.startChat(
      history.length
        ? ({ history, systemInstruction: systemInstruction || undefined } as any)
        : undefined
    )

    const result = await chat.sendMessage(options.messages.at(-1)?.content || '')
    const response = result.response
    const candidate = response.candidates?.[0]
    const parts = candidate?.content?.parts ?? []

    let content = ''
    const toolCalls: ChatChunk['tool_calls'] = []

    for (const part of parts) {
      if (part.text) content += part.text

      const functionCall = part.functionCall
      if (functionCall?.name) {
        const id = (functionCall as any).id || randomUUID()
        toolCalls.push({
          id,
          type: 'function' as const,
          function: {
            name: functionCall.name,
            arguments: JSON.stringify(functionCall.args ?? {})
          }
        })
      }
    }

    yield {
      content,
      tool_calls: toolCalls.length ? toolCalls : undefined,
      model: options.model || this.modelName,
      total_tokens: (response as any).usageMetadata?.totalTokenCount
    }
  }

  async getModelPlacement(): Promise<ModelPlacement> {
    return 'unknown'
  }
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { value }
  }
}
