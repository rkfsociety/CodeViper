import type {
  AgentSettings,
  AgentStreamPayload,
  ChatMessage,
  MemoryCategory
} from '../../src/types'
import { extractEmbeddedToolCalls, sanitizeAssistantContent } from '../../shared/toolCalls'
import {
  claimsActionCompleted,
  MUTATING_TOOLS,
  taskLikelyNeedsMutation,
  TOOL_VERIFICATION_FAILED_MESSAGE,
  TOOL_VERIFICATION_NUDGE
} from '../../shared/actionVerification'
import { prepareAgentRunContext, formatFileTree, type OllamaMessage } from './agentContext'
import { AGENT_TOOLS } from './agentTools'
import {
  getCodeViperSourceRoot,
  readCodeViperFile,
  runCodeViperCommand,
  writeCodeViperFile
} from './codeviperSource'
import { safeReadFile, safeWriteFile, runCommand, buildFileTree } from './services'
import { buildModelfile, parseTrainingData, prepareModelFromTrainingFile } from './ollamaModels'
import { readNdjsonLines } from './ndjson'
import {
  addMemory,
  deleteMemory,
  parseReflectionLearnings,
  searchMemories
} from './memory'
import {
  createSkill,
  deleteSkill,
  getSkill,
  listSkills,
  readSkillData,
  touchSkill,
  updateSkill,
  writeSkillData
} from './skills'

interface ToolCall {
  function: {
    name: string
    arguments: Record<string, string> | string
  }
}

interface OllamaChatChunk {
  message?: {
    content?: string
    tool_calls?: ToolCall[]
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    return JSON.parse(args) as Record<string, string>
  }
  return args
}

const REFLECTION_PROMPT = `Проанализируй выполненную задачу. Если есть полезные уроки для будущих задач (ошибки, паттерны проекта, предпочтения пользователя, навыки работы), верни JSON-массив до 2 элементов:
[{"content": "краткий урок", "category": "pattern|mistake|preference|project|skill", "tags": ["тег"]}]
Если уроков нет — верни [].
Только JSON, без пояснений.`

export class AgentRunner {
  constructor(
    private settings: AgentSettings,
    private projectPath: string,
    private emit: (event: AgentStreamPayload) => void,
    private signal?: AbortSignal
  ) {}

  private throwIfAborted(): void {
    if (this.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
  }

  private handleAbort(): void {
    this.emit({ type: 'error', content: 'Остановлено пользователем' })
    this.emit({ type: 'done' })
  }

  async run(history: ChatMessage[], userMessage: string): Promise<void> {
    this.throwIfAborted()

    const prepared = await prepareAgentRunContext(
      this.projectPath,
      history,
      userMessage,
      this.settings.model
    )
    this.throwIfAborted()

    this.emit({ type: 'context', contextPreview: prepared.preview })

    const messages: OllamaMessage[] = prepared.messages

    let usedTools = false
    const mutatingToolsUsed = new Set<string>()
    let verificationRetries = 0
    let verificationNoticeSent = false
    let requireToolNext = false
    const MAX_VERIFICATION_RETRIES = 1

    try {
      for (let step = 0; step < this.settings.maxSteps; step++) {
        this.throwIfAborted()

        let response
        try {
          response = await this.chat(messages, { requireTool: requireToolNext })
        } catch (error) {
          if (isAbortError(error)) {
            this.handleAbort()
            return
          }
          throw error
        }
        requireToolNext = false

        const assistantText = sanitizeAssistantContent(response.message?.content ?? '')
        const toolCalls: ToolCall[] = response.message?.tool_calls ?? []

        if (assistantText) {
          messages.push({ role: 'assistant', content: assistantText })
        }

        if (!toolCalls.length) {
          const mutationTask = taskLikelyNeedsMutation(userMessage)
          const noMutatingToolsYet = mutatingToolsUsed.size === 0
          const shouldRetryWithTools =
            mutationTask &&
            noMutatingToolsYet &&
            verificationRetries < MAX_VERIFICATION_RETRIES &&
            (claimsActionCompleted(assistantText) || assistantText.length > 0)

          if (shouldRetryWithTools) {
            verificationRetries += 1
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            if (!verificationNoticeSent) {
              verificationNoticeSent = true
              this.emit({
                type: 'error',
                content:
                  '⚠️ Модель ответила текстом без инструментов — повторяю с обязательным tool call…'
              })
            }
            messages.push({ role: 'user', content: TOOL_VERIFICATION_NUDGE })
            requireToolNext = true
            continue
          }

          if (mutationTask && noMutatingToolsYet && verificationRetries >= MAX_VERIFICATION_RETRIES) {
            if (assistantText) {
              messages.pop()
            }
            this.emit({ type: 'clear_draft' })
            this.emit({ type: 'error', content: TOOL_VERIFICATION_FAILED_MESSAGE })
            this.emit({ type: 'done' })
            return
          }

          if (assistantText) {
            this.emit({ type: 'assistant', content: assistantText })
          }
          if (this.settings.selfLearning !== false) {
            await this.reflectAndLearn(messages, userMessage, usedTools)
          }
          this.emit({ type: 'done' })
          return
        }

        usedTools = true

        for (const call of toolCalls) {
          this.throwIfAborted()

          const name = call.function.name
          const args = parseToolArgs(call.function.arguments ?? {})
          this.emit({
            type: 'tool_start',
            toolName: name,
            toolInput: JSON.stringify(args, null, 2)
          })

          let output = ''
          try {
            output = await this.executeTool(name, args)
          } catch (error) {
            output = `Ошибка: ${error instanceof Error ? error.message : String(error)}`
          }

          if (MUTATING_TOOLS.has(name)) {
            mutatingToolsUsed.add(name)
          }

          this.emit({
            type: 'tool_end',
            toolName: name,
            toolOutput: output
          })

          messages.push({
            role: 'tool',
            content: `Инструмент ${name}:\n${output}`
          })
        }
      }

      this.emit({
        type: 'error',
        content: `Достигнут лимит шагов агента (${this.settings.maxSteps}). Уточните задачу или увеличьте лимит.`
      })
      this.emit({ type: 'done' })
    } catch (error) {
      if (isAbortError(error)) {
        this.handleAbort()
        return
      }
      throw error
    }
  }

  private async chat(messages: OllamaMessage[], options?: { requireTool?: boolean }) {
    const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.settings.model,
        messages,
        tools: AGENT_TOOLS,
        stream: true,
        ...(options?.requireTool ? { tool_choice: 'required' as const } : {})
      }),
      signal: this.signal
    })

    if (!res.ok) {
      const text = await res.text()
      throw new Error(`Ollama: ${res.status} ${text}`)
    }

    if (!res.body) {
      throw new Error('Ollama: пустой ответ (нет body)')
    }

    let content = ''
    const toolCalls: ToolCall[] = []

    for await (const chunk of readNdjsonLines(res.body, this.signal)) {
      const message = chunk.message as OllamaChatChunk['message'] | undefined
      const piece = message?.content
      if (piece) {
        content += piece
        const visible = sanitizeAssistantContent(content)
        const embedded = extractEmbeddedToolCalls(content)
        const isPureToolCall = embedded.toolCalls.length > 0 && !embedded.content.trim()
        if (!isPureToolCall && visible) {
          this.emit({ type: 'token', content: piece })
        }
      }

      if (message?.tool_calls?.length) {
        toolCalls.push(...message.tool_calls)
      }
    }

    const embedded = extractEmbeddedToolCalls(content)
    content = sanitizeAssistantContent(embedded.content)
    for (const call of embedded.toolCalls) {
      toolCalls.push({
        function: {
          name: call.name,
          arguments: call.arguments as Record<string, string>
        }
      })
    }

    return {
      message: {
        content: content.trim() || undefined,
        tool_calls: toolCalls.length ? toolCalls : undefined
      }
    }
  }

  private async executeTool(name: string, args: Record<string, string>): Promise<string> {
    const { projectPath } = this

    switch (name) {
      case 'list_directory': {
        const tree = await buildFileTree(projectPath)
        return formatFileTree(tree) || '(пусто)'
      }
      case 'read_file': {
        return safeReadFile(projectPath, args.path)
      }
      case 'write_file': {
        await safeWriteFile(projectPath, args.path, args.content)
        return `Файл записан: ${args.path}`
      }
      case 'run_command': {
        const result = await runCommand(projectPath, args.command)
        return [
          `exit: ${result.exitCode}`,
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      }
      case 'remember': {
        const entry = await addMemory(projectPath, {
          content: args.content,
          category: args.category as MemoryCategory,
          tags: args.tags,
          source: args.source,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined
        })
        this.emit({
          type: 'learning_saved',
          content: entry.content,
          memoryId: entry.id
        })
        return `Запомнено [${entry.category}/${entry.scope}]: ${entry.content} (id: ${entry.id})`
      }
      case 'search_memory': {
        const results = await searchMemories(projectPath, args.query, 10)
        return JSON.stringify(results, null, 2)
      }
      case 'forget': {
        const removed = await deleteMemory(projectPath, args.id)
        return removed ? `Забыто: ${args.id}` : `Запись не найдена: ${args.id}`
      }
      case 'list_skills': {
        const skills = await listSkills(projectPath)
        return JSON.stringify(skills, null, 2)
      }
      case 'read_skill': {
        const skill = await getSkill(projectPath, args.id)
        if (!skill) return `Навык не найден: ${args.id}`
        await touchSkill(projectPath, skill.id)
        return JSON.stringify(skill, null, 2)
      }
      case 'create_skill': {
        const skill = await createSkill(projectPath, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers,
          scope: args.scope === 'project' || args.scope === 'global' ? args.scope : undefined,
          id: args.id
        })
        this.emit({
          type: 'skill_saved',
          content: skill.name,
          skillId: skill.id
        })
        return `Навык создан: ${skill.name} (id: ${skill.id}, scope: ${skill.scope})`
      }
      case 'update_skill': {
        const skill = await updateSkill(projectPath, args.id, {
          name: args.name,
          description: args.description,
          instructions: args.instructions,
          triggers: args.triggers
        })
        if (!skill) return `Навык не найден: ${args.id}`
        this.emit({
          type: 'skill_saved',
          content: skill.name,
          skillId: skill.id
        })
        return `Навык обновлён: ${skill.name} (id: ${skill.id})`
      }
      case 'delete_skill': {
        const removed = await deleteSkill(projectPath, args.id)
        return removed ? `Навык удалён: ${args.id}` : `Навык не найден: ${args.id}`
      }
      case 'read_skill_data': {
        const data = await readSkillData(projectPath, args.skill_id)
        if (!data) return `Навык не найден: ${args.skill_id}`
        return data.content
      }
      case 'write_skill_data': {
        const ok = await writeSkillData(projectPath, args.skill_id, args.content)
        return ok ? `Данные навыка записаны: ${args.skill_id}` : `Навык не найден: ${args.skill_id}`
      }
      case 'list_codeviper_directory': {
        const root = getCodeViperSourceRoot()
        const tree = await buildFileTree(root)
        return formatFileTree(tree) || '(пусто)'
      }
      case 'read_codeviper_file': {
        return readCodeViperFile(args.path)
      }
      case 'write_codeviper_file': {
        await writeCodeViperFile(args.path, args.content)
        return `Файл CodeViper записан: ${args.path}`
      }
      case 'run_codeviper_command': {
        const result = await runCodeViperCommand(args.command)
        return [
          `exit: ${result.exitCode}`,
          result.stdout ? `stdout:\n${result.stdout}` : '',
          result.stderr ? `stderr:\n${result.stderr}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      }
      case 'preview_ollama_modelfile': {
        const raw = await safeReadFile(projectPath, args.data_path)
        const examples = parseTrainingData(raw)
        if (!examples.length) {
          return 'Ошибка: в файле нет примеров {user, assistant} (JSON или JSONL).'
        }
        const modelfile = buildModelfile({
          baseModel: args.base_model,
          system: args.system,
          examples,
          temperature: args.temperature ? Number(args.temperature) : undefined
        })
        return `Примеров: ${examples.length}\n\n${modelfile}`
      }
      case 'create_ollama_model': {
        const raw = await safeReadFile(projectPath, args.data_path)
        const temperature = args.temperature ? Number(args.temperature) : undefined
        const result = await prepareModelFromTrainingFile({
          baseUrl: this.settings.ollamaUrl,
          baseModel: args.base_model,
          modelName: args.model_name,
          trainingRaw: raw,
          system: args.system,
          temperature: Number.isFinite(temperature) ? temperature : undefined,
          signal: this.signal
        })
        return [
          `Модель создана: ${args.model_name}`,
          `Статус Ollama: ${result.status}`,
          `Примеров в Modelfile: ${result.exampleCount}`,
          'Выберите модель в настройках CodeViper или укажите в следующем запросе.',
          '',
          'Modelfile:',
          result.modelfile
        ].join('\n')
      }
      default:
        return `Неизвестный инструмент: ${name}`
    }
  }

  private async reflectAndLearn(
    messages: OllamaMessage[],
    userMessage: string,
    usedTools: boolean
  ): Promise<void> {
    if (!usedTools) return

    try {
      const res = await fetch(`${this.settings.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.settings.model,
          messages: [...messages, { role: 'user', content: REFLECTION_PROMPT }],
          stream: false
        }),
        signal: this.signal
      })

      if (!res.ok) return

      const data = (await res.json()) as { message?: { content?: string } }
      const learnings = parseReflectionLearnings(data.message?.content ?? '')

      for (const learning of learnings) {
        const entry = await addMemory(this.projectPath, {
          ...learning,
          source: userMessage.slice(0, 120)
        })
        this.emit({
          type: 'learning_saved',
          content: entry.content,
          memoryId: entry.id
        })
      }
    } catch {
      // рефлексия необязательна
    }
  }
}

export async function fetchOllamaModels(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/tags`)
  if (!res.ok) throw new Error('Ollama недоступна')
  const data = (await res.json()) as {
    models?: Array<{ name: string; size: number; modified_at: string }>
  }
  return (data.models ?? []).map((m) => ({
    name: m.name,
    size: m.size,
    modifiedAt: m.modified_at
  }))
}

export async function pingOllama(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`)
    return res.ok
  } catch {
    return false
  }
}

export interface OllamaPullProgress {
  status: string
  digest?: string
  total?: number
  completed?: number
}

export async function pullOllamaModel(
  baseUrl: string,
  model: string,
  onProgress: (progress: OllamaPullProgress) => void
): Promise<void> {
  const res = await fetch(`${baseUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, stream: true })
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Ollama pull: ${res.status} ${text}`)
  }

  if (!res.body) {
    throw new Error('Ollama: пустой ответ при скачивании')
  }

  for await (const chunk of readNdjsonLines(res.body)) {
    onProgress({
      status: String(chunk.status ?? ''),
      digest: chunk.digest as string | undefined,
      total: chunk.total as number | undefined,
      completed: chunk.completed as number | undefined
    })
  }
}
