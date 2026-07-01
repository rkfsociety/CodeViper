/**
 * SubagentRunner — самостоятельный мини-прогон агента с ограниченным tool set и лимитом шагов.
 * Используется для explorer/editor субагентов внутри основного AgentRunner.
 *
 * Не имеет доступа к ResponseEmitter и ContextManager основного агента —
 * работает изолированно через прямые вызовы ModelRuntime.
 */
import { ModelRuntime } from './modelRuntime'
import { getAgentTools } from './agentTools'
import { resolveAgentHandlerFactories } from './runtimeBootstrap'
import { extractEmbeddedToolCalls, sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentSettings } from '../../src/types'
import type { OllamaMessage } from './ollamaMessage'
import type { SubagentOptions, SubagentResult, SubagentRole } from '../../shared/subagent'
import { resolveAllowedTools, resolveMaxSteps } from '../../shared/subagent'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_MODEL_DEFAULT,
  GEMINI_API_BASE_URL,
  GEMINI_MODEL_DEFAULT,
  LITEROUTER_API_BASE_URL,
  LITEROUTER_MODEL_DEFAULT,
  OPENROUTER_API_BASE_URL
} from '../../shared/constants'
import type { ProviderConfig } from '../../shared/modelProvider'

function buildProviderConfig(settings: AgentSettings): ProviderConfig {
  const type = settings.modelProvider ?? 'ollama'
  const baseUrl =
    type === 'deepseek'
      ? DEEPSEEK_API_BASE_URL
      : type === 'literouter'
        ? settings.literouterBaseUrl || LITEROUTER_API_BASE_URL
        : type === 'gemini'
          ? GEMINI_API_BASE_URL
          : type === 'openrouter'
            ? OPENROUTER_API_BASE_URL
            : settings.ollamaUrl
  const model =
    type === 'deepseek' && !/^deepseek/i.test(settings.model ?? '')
      ? DEEPSEEK_MODEL_DEFAULT
      : type === 'literouter' && !(settings.model ?? '').trim()
        ? LITEROUTER_MODEL_DEFAULT
        : type === 'gemini' && !/^gemini/i.test(settings.model ?? '')
          ? GEMINI_MODEL_DEFAULT
          : settings.model
  const apiKey =
    type === 'deepseek'
      ? (settings.deepseekApiKey ?? settings.providerApiKey)
      : type === 'literouter'
        ? (settings.literouterApiKey ?? settings.providerApiKey)
        : type === 'gemini'
          ? (settings.geminiApiKey ?? settings.providerApiKey)
          : type === 'openrouter'
            ? (settings.openrouterApiKey ?? settings.providerApiKey)
            : type === 'openai'
              ? (settings.openaiApiKey ?? settings.providerApiKey)
              : undefined
  return { type, baseUrl, apiKey, model }
}

const SYSTEM_PROMPT_EXPLORER = `Ты субагент-разведчик CodeViper.
Задача: изучить структуру проекта, собрать нужные факты и вернуть краткую сводку.
Используй только read-only инструменты. Не редактируй файлы.
Отвечай кратко — только факты, нужные для выполнения задачи.`

const SYSTEM_PROMPT_EDITOR = `Ты субагент-редактор CodeViper.
Задача: выполнить конкретные изменения в файлах проекта согласно инструкции.
Работай точечно, не трогай лишние файлы. По завершении кратко опиши что сделал.`

const SYSTEM_PROMPT_REVIEWER = `Ты субагент-ревьюер CodeViper.
Задача: провести code review или diff review, найти риски, регрессии, пропущенные тесты и спорные места.
Используй только read-only инструменты. Не редактируй файлы и не предлагай фиксы патчами.
Верни список находок по важности, а если проблем нет — явно напиши, что критичных замечаний не найдено.`

const SYSTEM_PROMPT_TESTER = `Ты субагент-тестировщик CodeViper.
Задача: запускать и анализировать тесты, локализовать падения и кратко объяснять результат.
Можно использовать только тестовые и диагностические инструменты. Не редактируй файлы.
Если запускаешь run_command, используй только команды для тестов, typecheck или build-проверок.`

const REVIEW_TASK_RE =
  /\b(review|reviewer|ревью|код-ревью|code review|diff review|проверь код|сделай обзор)\b/i
const TEST_TASK_RE =
  /\b(tests|tester|тесты|прогони тесты|запусти тесты|run tests|failing tests?|упали тесты|test suite|unit tests?|integration tests?)\b/i

export function resolveAutoDelegationRole(
  task: string
): Extract<SubagentRole, 'reviewer' | 'tester'> | null {
  const normalized = task.trim()
  if (!normalized) return null
  if (REVIEW_TASK_RE.test(normalized)) return 'reviewer'
  if (TEST_TASK_RE.test(normalized)) return 'tester'
  return null
}

function systemPromptForRole(role: SubagentOptions['role']): string {
  switch (role) {
    case 'explorer':
      return SYSTEM_PROMPT_EXPLORER
    case 'editor':
      return SYSTEM_PROMPT_EDITOR
    case 'reviewer':
      return SYSTEM_PROMPT_REVIEWER
    case 'tester':
      return SYSTEM_PROMPT_TESTER
  }
}

/**
 * Запустить субагента с ограниченным tool set.
 *
 * @returns SubagentResult — итоговый текст + статистика
 */
export async function runSubagent(
  settings: AgentSettings,
  options: SubagentOptions
): Promise<SubagentResult> {
  const { role, task, projectPath, signal } = options
  const allowedTools = resolveAllowedTools(role, options.disableTools)
  const maxSteps = resolveMaxSteps(role, options.maxSteps)

  // Все доступные инструменты агента — затем фильтруем по allowedTools
  // getAgentTools возвращает трансформированный формат { name, description, input_schema }
  const allTools = getAgentTools(settings.disabledTools)
  const filteredTools = allTools.filter((t) => allowedTools.includes(t.name))

  // Обработчики инструментов (только project-tools для explorer/editor)
  const { handlers } = resolveAgentHandlerFactories().createProjectToolHandlers(
    projectPath,
    settings.commandTimeoutSec != null ? settings.commandTimeoutSec * 1000 : undefined,
    {
      readonlyMode:
        role === 'explorer' || role === 'reviewer' || role === 'tester'
          ? true
          : settings.readonlyMode,
      commandBlocklist: settings.commandBlocklist,
      commandAllowlist: settings.commandAllowlist
    }
  )

  const runtime = new ModelRuntime(buildProviderConfig(settings))

  const messages: OllamaMessage[] = [
    { role: 'system', content: systemPromptForRole(role) },
    { role: 'user', content: task }
  ]

  let output = ''
  let steps = 0
  const toolsUsed: string[] = []
  const isCloud = (settings.modelProvider ?? 'ollama') !== 'ollama'

  while (steps < maxSteps) {
    if (signal?.aborted) break

    let content = ''
    let nativeToolCallName: string | undefined
    let nativeToolCallArgs: Record<string, string> | string | undefined
    let nativeToolCallId: string | undefined

    const chatOptions = {
      model: settings.model,
      messages: messages.map((m) => ({
        role: m.role as 'system' | 'user' | 'assistant' | 'tool',
        content: m.content,
        ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        ...(m.tool_call_id ? { tool_call_id: m.tool_call_id } : {})
      })),
      tools: filteredTools,
      stream: true as const,
      signal,
      ...(isCloud ? { max_tokens: 2048, temperature: 0.1 } : {})
    }

    for await (const chunk of runtime.chat(chatOptions)) {
      if (chunk.content) content += chunk.content
      if (chunk.tool_calls?.length) {
        const tc = chunk.tool_calls[0]
        nativeToolCallName = tc.function.name
        nativeToolCallArgs = tc.function.arguments as Record<string, string> | string
        nativeToolCallId = tc.id
      }
    }

    steps += 1

    // Попытка распарсить text-based tool call (Ollama без нативных tool calls)
    const embedded = extractEmbeddedToolCalls(content)
    const textToolCall =
      !nativeToolCallName && embedded.toolCalls.length ? embedded.toolCalls[0] : null

    const toolName = nativeToolCallName ?? textToolCall?.name
    const toolArgs =
      nativeToolCallName && nativeToolCallArgs != null
        ? typeof nativeToolCallArgs === 'string'
          ? (JSON.parse(nativeToolCallArgs) as Record<string, string>)
          : (nativeToolCallArgs as Record<string, string>)
        : textToolCall
          ? (textToolCall.arguments as Record<string, string>)
          : undefined

    if (toolName && toolArgs !== undefined && allowedTools.includes(toolName)) {
      // Добавляем вызов в историю
      const assistantMsg: OllamaMessage = {
        role: 'assistant',
        content: sanitizeAssistantContent(content),
        ...(nativeToolCallId
          ? {
              tool_calls: [
                {
                  id: nativeToolCallId,
                  type: 'function' as const,
                  function: {
                    name: toolName,
                    arguments:
                      typeof nativeToolCallArgs === 'string'
                        ? nativeToolCallArgs
                        : JSON.stringify(nativeToolCallArgs)
                  }
                }
              ]
            }
          : {})
      }
      messages.push(assistantMsg)

      // Выполняем инструмент
      const handlerFn = (
        handlers as unknown as Record<string, (args: Record<string, string>) => Promise<string>>
      )[toolName]
      let toolResult: string
      try {
        toolResult = handlerFn ? await handlerFn(toolArgs) : `Инструмент ${toolName} недоступен`
      } catch (err) {
        toolResult = `Ошибка: ${err instanceof Error ? err.message : String(err)}`
      }
      toolsUsed.push(toolName)

      const toolMsg: OllamaMessage = {
        role: 'tool',
        content: toolResult,
        ...(nativeToolCallId ? { tool_call_id: nativeToolCallId } : {})
      }
      messages.push(toolMsg)
    } else {
      // Нет tool call — субагент завершил работу
      output = sanitizeAssistantContent(content)
      break
    }
  }

  // Если вышли по лимиту — собираем финальный ответ
  if (!output) {
    output = `[Субагент достиг лимита шагов (${maxSteps}). Выполнено шагов: ${steps}. Использованные инструменты: ${toolsUsed.join(', ') || 'нет'}]`
  }

  return {
    output,
    steps,
    completed: steps < maxSteps && !signal?.aborted,
    toolsUsed
  }
}
