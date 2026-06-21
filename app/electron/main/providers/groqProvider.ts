import { OpenAIProvider } from './openaiProvider'

export class GroqProvider extends OpenAIProvider {
  constructor(apiKey: string, modelName: string) {
    super(
      'https://api.groq.com/openai/v1',
      apiKey,
      modelName,
      {},
      'https://api.groq.com/openai/v1/models'
    )
  }
}
