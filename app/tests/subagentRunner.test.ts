/**
 * Unit-тесты SubagentRunner + контракта subagent.ts.
 *
 * Изолируем ModelRuntime и createProjectToolHandlers.
 * Проверяем:
 *   - explorer завершается без tool calls
 *   - explorer вызывает read_file и возвращает результат
 *   - editor вызывает edit_file
 *   - explorer отклоняет edit_file (не в allowedTools)
 *   - лимит шагов завершает прогон
 *   - resolveAllowedTools / resolveMaxSteps работают корректно
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// ── hoisted state ────────────────────────────────────────────────────────────
const chatState = vi.hoisted(() => ({
  impl: null as null | (() => AsyncGenerator<{ content: string }>)
}))

const handlerState = vi.hoisted(() => ({
  handlers: {} as Record<string, (args: Record<string, string>) => Promise<string>>
}))

// ── electron ─────────────────────────────────────────────────────────────────
vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/subagent' }
}))

// ── ModelRuntime ──────────────────────────────────────────────────────────────
vi.mock('../electron/main/modelRuntime', () => {
  function MockModelRuntime() {
    /* */
  }
  MockModelRuntime.prototype.chat = async function* () {
    if (!chatState.impl) throw new Error('chatState.impl не задан')
    yield* chatState.impl()
  }
  return { ModelRuntime: MockModelRuntime }
})

// ── createProjectToolHandlers ─────────────────────────────────────────────────
vi.mock('../electron/main/agentHandlersProject', () => ({
  createProjectToolHandlers: () => ({
    handlers: handlerState.handlers,
    clearEditSnapshots: () => {}
  })
}))

// ── getAgentTools — возвращаем минимальный набор ──────────────────────────────
vi.mock('../electron/main/agentTools', () => ({
  getAgentTools: () => [
    { function: { name: 'read_file', description: 'read' } },
    { function: { name: 'edit_file', description: 'edit' } },
    { function: { name: 'list_directory', description: 'ls' } }
  ]
}))

import { runSubagent } from '../electron/main/subagentRunner'
import {
  resolveAllowedTools,
  resolveMaxSteps,
  EXPLORER_ALLOWED_TOOLS,
  EDITOR_ALLOWED_TOOLS,
  REVIEWER_ALLOWED_TOOLS,
  TESTER_ALLOWED_TOOLS,
  SUBAGENT_MAX_STEPS
} from '../shared/subagent'
import { resolveAutoDelegationRole } from '../electron/main/subagentRunner'
import type { AgentSettings } from '../src/types'

function makeSettings(): AgentSettings {
  return { model: 'test-model', ollamaUrl: 'http://localhost:11434' }
}

// Хелпер: одиночный ответ без tool call
function plainResponse(text: string): () => AsyncGenerator<{ content: string }> {
  return async function* () {
    yield { content: text }
  }
}

// Хелпер: tool call в тексте (text-based, extractEmbeddedToolCalls)
function toolCallThenDone(
  toolName: string,
  args: Record<string, string>,
  finalText: string
): () => AsyncGenerator<{ content: string }> {
  let call = 0
  return async function* () {
    if (call === 0) {
      call++
      yield { content: JSON.stringify({ name: toolName, arguments: args }) }
    } else {
      yield { content: finalText }
    }
  }
}

describe('shared/subagent — контракт', () => {
  it('explorer содержит только read-only инструменты', () => {
    const tools = resolveAllowedTools('explorer')
    expect(tools).toContain('read_file')
    expect(tools).toContain('grep_search')
    expect(tools).not.toContain('edit_file')
    expect(tools).not.toContain('write_file')
  })

  it('editor содержит mutating инструменты', () => {
    const tools = resolveAllowedTools('editor')
    expect(tools).toContain('edit_file')
    expect(tools).toContain('write_file')
    expect(tools).toContain('read_file')
  })

  it('disableTools исключает инструмент из explorer', () => {
    const tools = resolveAllowedTools('explorer', ['run_command'])
    expect(tools).not.toContain('run_command')
    expect(tools).toContain('read_file')
  })

  it('resolveMaxSteps не превышает cap роли', () => {
    expect(resolveMaxSteps('explorer', 100)).toBe(SUBAGENT_MAX_STEPS.explorer)
    expect(resolveMaxSteps('explorer', 5)).toBe(5)
    expect(resolveMaxSteps('editor')).toBe(SUBAGENT_MAX_STEPS.editor)
  })

  it('EXPLORER_ALLOWED_TOOLS — нет пересечения с edit_file', () => {
    expect(EXPLORER_ALLOWED_TOOLS).not.toContain('edit_file')
  })

  it('EDITOR_ALLOWED_TOOLS содержит все инструменты explorer', () => {
    for (const t of EXPLORER_ALLOWED_TOOLS) {
      expect(EDITOR_ALLOWED_TOOLS).toContain(t)
    }
  })

  it('reviewer получает read-only diff/test инструменты', () => {
    const tools = resolveAllowedTools('reviewer')
    expect(tools).toEqual(REVIEWER_ALLOWED_TOOLS)
    expect(tools).toContain('git_diff')
    expect(tools).toContain('run_tests')
    expect(tools).not.toContain('edit_file')
  })

  it('tester получает только тестовые и диагностические инструменты', () => {
    const tools = resolveAllowedTools('tester')
    expect(tools).toEqual(TESTER_ALLOWED_TOOLS)
    expect(tools).toContain('run_tests')
    expect(tools).toContain('run_command')
    expect(tools).not.toContain('write_file')
  })

  it('resolveAutoDelegationRole отправляет review-задачи в reviewer', () => {
    expect(resolveAutoDelegationRole('Сделай code review diff перед коммитом')).toBe('reviewer')
  })

  it('resolveAutoDelegationRole отправляет test-задачи в tester', () => {
    expect(resolveAutoDelegationRole('Прогони тесты и покажи failing test')).toBe('tester')
  })
})

describe('SubagentRunner — прогон', () => {
  let projectDir: string

  beforeEach(() => {
    projectDir = mkdtempSync(join(tmpdir(), 'cv-sub-'))
    writeFileSync(join(projectDir, 'foo.ts'), 'export const x = 1')
    handlerState.handlers = {}
  })

  it('explorer завершается без tool calls', async () => {
    chatState.impl = plainResponse('Ответ разведчика')

    const result = await runSubagent(makeSettings(), {
      role: 'explorer',
      task: 'Что в проекте?',
      projectPath: projectDir
    })

    expect(result.output).toBe('Ответ разведчика')
    expect(result.steps).toBe(1)
    expect(result.completed).toBe(true)
    expect(result.toolsUsed).toHaveLength(0)
  })

  it('explorer вызывает read_file и получает результат', async () => {
    handlerState.handlers['read_file'] = async (_args) => 'содержимое файла'
    chatState.impl = toolCallThenDone(
      'read_file',
      { path: 'foo.ts' },
      'Файл прочитан, вот результат'
    )

    const result = await runSubagent(makeSettings(), {
      role: 'explorer',
      task: 'Прочитай foo.ts',
      projectPath: projectDir
    })

    expect(result.toolsUsed).toContain('read_file')
    expect(result.output).toBe('Файл прочитан, вот результат')
    expect(result.completed).toBe(true)
  })

  it('editor вызывает edit_file', async () => {
    handlerState.handlers['edit_file'] = async (_args) => 'файл изменён'
    chatState.impl = toolCallThenDone(
      'edit_file',
      { path: 'foo.ts', old_string: 'x = 1', new_string: 'x = 2' },
      'Редактирование выполнено'
    )

    const result = await runSubagent(makeSettings(), {
      role: 'editor',
      task: 'Измени foo.ts',
      projectPath: projectDir
    })

    expect(result.toolsUsed).toContain('edit_file')
    expect(result.output).toBe('Редактирование выполнено')
  })

  it('explorer игнорирует edit_file (не в allowedTools)', async () => {
    const editCalled = vi.fn()
    handlerState.handlers['edit_file'] = async () => {
      editCalled()
      return 'отредактировано'
    }
    // Модель пытается вызвать edit_file, но explorer не должен его пропускать
    chatState.impl = toolCallThenDone(
      'edit_file',
      { path: 'foo.ts', old_string: 'x', new_string: 'y' },
      'попытка редактирования'
    )

    const result = await runSubagent(makeSettings(), {
      role: 'explorer',
      task: 'Попробуй редактировать',
      projectPath: projectDir
    })

    // edit_file не в allowedTools у explorer → инструмент не вызван
    expect(editCalled).not.toHaveBeenCalled()
    expect(result.toolsUsed).not.toContain('edit_file')
  })

  it('прогон останавливается по лимиту шагов', async () => {
    // Каждый шаг модель возвращает tool call, субагент никогда не даёт финальный ответ
    let step = 0
    handlerState.handlers['read_file'] = async () => 'данные'
    chatState.impl = async function* () {
      step++
      yield { content: JSON.stringify({ name: 'read_file', arguments: { path: 'foo.ts' } }) }
    }

    const result = await runSubagent(makeSettings(), {
      role: 'explorer',
      task: 'Читай бесконечно',
      projectPath: projectDir,
      maxSteps: 3
    })

    expect(result.steps).toBe(3)
    expect(result.completed).toBe(false)
    expect(result.output).toContain('лимита шагов')
  })

  it('AbortSignal прерывает прогон', async () => {
    const ac = new AbortController()
    ac.abort()

    chatState.impl = plainResponse('не должен выполниться')

    const result = await runSubagent(makeSettings(), {
      role: 'explorer',
      task: 'задача',
      projectPath: projectDir,
      signal: ac.signal
    })

    expect(result.completed).toBe(false)
    expect(result.steps).toBe(0)
  })
})
