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
      const res = await fetch(
        `${this.baseUrl}/models?key=${encodeURIComponent(this.apiKey)}&pageSize=100`
      )
      if (!res.ok) return []

      const data = (await res.json()) as {
        models?: Array<{
          name?: string
          displayName?: string
          supportedGenerationMethods?: string[]
          inputTokenLimit?: number
          outputTokenLimit?: number
        }>
      }

      return (data.models ?? [])
        .filter((m) => {
          const methods = m.supportedGenerationMethods ?? []
          // Оставляем только модели, поддерживающие generateContent (для tool calling)
          return methods.includes('generateContent')
        })
        .map((m) => {
          const name = (m.name ?? '').replace(/^models\//, '')
          const ctx = m.inputTokenLimit
          return { name, contextLength: ctx }
        })
        .filter((m) => m.name)
    } catch {
      return []
    }
  }

  async *chat(options: ChatOptions): AsyncGenerator<ChatChunk> {
    const modelName = options.model || this.modelName
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const modelInit: any = { model: modelName }
    if (options.tools?.length) {
      modelInit.tools = [
        {
          functionDeclarations: options.tools.map((tool) => ({
            name: tool.name,
            description: tool.description,
            parameters: tool.input_schema
          }))
        }
      ]
    }
    const model = this.genAI.getGenerativeModel(modelInit)

    const systemMessages = options.messages.filter((msg) => msg.role === 'system' && msg.content)
    const systemInstruction = systemMessages
      .map((msg) => msg.content)
      .join('\n')
      .trim()

    const toolNameById = new Map<string, string>()
    const history: GeminiContent[] = []

    const nonSystemMessages = options.messages.filter((m) => m.role !== 'system')

    // Все сообщения кроме последнего пользовательского — в историю
    for (let i = 0; i < nonSystemMessages.length - 1; i++) {
      const msg = nonSystemMessages[i]

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

    const lastMsg = nonSystemMessages.at(-1)
    const lastContent = lastMsg?.content || ''

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chatInit: any =
      history.length || systemInstruction
        ? { history, systemInstruction: systemInstruction || undefined }
        : undefined
    const chat = model.startChat(chatInit)

    const result = await chat.sendMessageStream(lastContent)

    const toolCalls: ChatChunk['tool_calls'] = []

    for await (const chunk of result.stream) {
      const candidate = chunk.candidates?.[0]
      const parts = candidate?.content?.parts ?? []

      let text = ''
      for (const part of parts) {
        if (part.text) text += part.text

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const functionCall = (part as any).functionCall
        if (functionCall?.name) {
          const id = (functionCall.id as string) || randomUUID()
          toolCalls.push({
            id,
            type: 'function' as const,
            function: {
              name: functionCall.name as string,
              arguments: JSON.stringify(functionCall.args ?? {})
            }
          })
        }
      }

      if (text) {
        yield {
          content: text,
          model: modelName
        }
      }
    }

    const finalResponse = await result.response
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalTokens = (finalResponse as any).usageMetadata?.totalTokenCount as number | undefined

    // Tool calls отдаём в конце (они не стримятся)
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
}

function safeJsonParse(value: string): Record<string, unknown> {
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return { value }
  }
}
