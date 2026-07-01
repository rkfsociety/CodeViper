import { getModelContextLimitTokens } from '../../shared/contextLimits'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { ProviderConfig } from '../../shared/modelProvider'
import type { AgentSettings } from '../../src/types'
import { redactMessagesForModel } from '../../shared/secretRedaction'
import type { ModelRuntime } from './modelRuntime'

const OLLAMA_KEEP_ALIVE = '5m'
const PLAN_MAX_TOKENS = 2048

/** Промпт для пошагового плана основной моделью (без tool calls). */
export function buildAgentPlanPrompt(userMessage: string, projectPath: string): string {
  const projectLine = projectPath.trim() ? `\nКорень проекта: ${projectPath.trim()}` : ''
  return (
    'Составь пошаговый план выполнения задачи на русском (3–6 шагов).\n' +
    'Формат: нумерованные строки «1. …», «2. …» — каждый шаг = конкретное действие (grep/read/run/файл).\n' +
    'Не пересказывай задачу одним предложением; не вызывай инструменты — только план.' +
    `${projectLine}\n\nЗадача:\n${userMessage}`
  )
}

/** План перед выполнением через основную модель агента (оркестратор выключен). */
export async function generateExecutionPlan(opts: {
  userMessage: string
  projectPath: string
  settings: AgentSettings
  modelRuntime: ModelRuntime
  providerConfig: ProviderConfig
  signal?: AbortSignal
}): Promise<string> {
  const { userMessage, projectPath, settings, modelRuntime, providerConfig, signal } = opts
  const model = settings.model
  const isCloud = providerConfig.type !== 'ollama'

  if (!isCloud) {
    await modelRuntime.ensureModelLoaded(model, signal)
    await modelRuntime.prepareModel(model)
  }

  const prompt = buildAgentPlanPrompt(userMessage, projectPath)
  const messages = redactMessagesForModel([{ role: 'user', content: prompt }])

  let content = ''
  for await (const chunk of modelRuntime.chat({
    model,
    messages,
    tools: [],
    stream: true,
    signal,
    keep_alive: isCloud ? undefined : OLLAMA_KEEP_ALIVE,
    ...(isCloud ? { max_tokens: PLAN_MAX_TOKENS, temperature: 0.2 } : {}),
    ...(!isCloud && settings.ollamaNumGpu != null ? { num_gpu: settings.ollamaNumGpu } : {}),
    ...(!isCloud ? { num_ctx: getModelContextLimitTokens(model) } : {})
  })) {
    content += chunk.content
    if (chunk.stop_reason) break
  }

  return sanitizeAssistantContent(content).trim()
}
