import { OpenAIProvider } from './openaiProvider'

export class TogetherProvider extends OpenAIProvider {
  constructor(apiKey: string, modelName: string) {
    super(
      'https://api.together.xyz/v1',
      apiKey,
      modelName,
      {},
      'https://api.together.xyz/v1/models'
    )
  }
}
