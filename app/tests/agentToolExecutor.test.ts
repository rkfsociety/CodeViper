import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AgentSettings, AgentStreamPayload } from '../src/types'

const TOOL_DELAY_MS = 100

vi.mock('electron', () => ({
  app: { getPath: () => '/tmp/vitest-agentToolExecutor' }
}))

vi.mock('../electron/main/agentLogger', () => ({
  agentLogger: { write: vi.fn() }
}))

vi.mock('../electron/main/mcpTools', () => ({
  notifyMcpToolResult: vi.fn().mockResolvedValue(undefined),
  createMcpToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersProject', () => ({
  createProjectToolHandlers: () => ({ handlers: {}, clearEditSnapshots: vi.fn() })
}))

vi.mock('../electron/main/agentHandlersGitHub', () => ({
  createGitHubToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersGitLab', () => ({
  createGitLabToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersJira', () => ({
  createJiraToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersLinear', () => ({
  createLinearToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersMemory', () => ({
  createMemoryToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersSkills', () => ({
  createSkillsToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersTodo', () => ({
  createTodoToolHandlers: () => ({})
}))

vi.mock('../electron/main/agentHandlersWeb', () => ({
  createWebToolHandlers: () => ({})
}))

vi.mock('../electron/main/subagentRunner', () => ({
  runSubagent: vi.fn()
}))

import { ToolExecutor } from '../electron/main/agentToolExecutor'
import { runSubagent } from '../electron/main/subagentRunner'
import { toolLabel } from '../shared/toolDisplay'

function delayHandler(ms: number, output: string) {
  return async () => {
    await new Promise((resolve) => setTimeout(resolve, ms))
    return output
  }
}

function minimalSettings(): AgentSettings {
  return {
    ollamaUrl: 'http://localhost:11434',
    model: 'test-model',
    permissionMode: 'bypass'
  }
}

describe('ToolExecutor.executeParallel', () => {
  let emitted: AgentStreamPayload[]

  beforeEach(() => {
    emitted = []
  })

  it('выполняет два независимых tool call параллельно (wall time < sum)', async () => {
    const executor = new ToolExecutor('/tmp/project', minimalSettings(), (event) => {
      emitted.push(event)
    })

    executor.overrideHandlers({
      read_file: delayHandler(TOOL_DELAY_MS, 'content-a'),
      grep_files: delayHandler(TOOL_DELAY_MS, 'matches-b')
    })

    const started = Date.now()
    const results = await executor.executeParallel(
      [
        { id: 'call-1', function: { name: 'read_file', arguments: { path: 'a.txt' } } },
        { id: 'call-2', function: { name: 'grep_files', arguments: { pattern: 'foo' } } }
      ],
      1
    )
    const elapsed = Date.now() - started

    expect(elapsed).toBeLessThan(TOOL_DELAY_MS * 2 - 20)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ id: 'call-1', name: 'read_file', output: 'content-a' })
    expect(results[1]).toMatchObject({ id: 'call-2', name: 'grep_files', output: 'matches-b' })

    const toolStarts = emitted.filter((e) => e.type === 'tool_start')
    expect(toolStarts).toHaveLength(2)
    expect(toolStarts.map((e) => e.toolName)).toEqual(['read_file', 'grep_files'])
  })

  it('последовательный вызов двух handler занимает не меньше суммы задержек', async () => {
    const executor = new ToolExecutor('/tmp/project', minimalSettings(), () => {})

    executor.overrideHandlers({
      read_file: delayHandler(TOOL_DELAY_MS, 'a'),
      grep_files: delayHandler(TOOL_DELAY_MS, 'b')
    })

    const started = Date.now()
    await executor.executeTool('read_file', { path: 'a.txt' })
    await executor.executeTool('grep_files', { pattern: 'x' })
    const elapsed = Date.now() - started

    expect(elapsed).toBeGreaterThanOrEqual(TOOL_DELAY_MS * 2 - 10)
  })

  it('добавляет nudge при повторном read_file с тем же неверным путём', async () => {
    const executor = new ToolExecutor('/tmp/project', minimalSettings(), () => {})
    executor.beginRun()
    executor.overrideHandlers({
      read_file: async () => 'Ошибка: ENOENT: no such file or directory'
    })

    const [first] = await executor.executeParallel(
      [{ function: { name: 'read_file', arguments: { path: 'src' } } }],
      1
    )
    expect(first.output).not.toMatch(/уже пробовал/)

    const [second] = await executor.executeParallel(
      [{ function: { name: 'read_file', arguments: { path: 'src' } } }],
      2
    )
    expect(second.output).toMatch(/уже пробовал read_file/)
  })

  it('delegate_to_reviewer запускает read-only reviewer-субагента', async () => {
    vi.mocked(runSubagent).mockResolvedValue({
      output: 'No critical findings.',
      steps: 2,
      completed: true,
      toolsUsed: ['git_status', 'git_diff']
    })
    const executor = new ToolExecutor('/tmp/project', minimalSettings(), () => {})

    const output = await executor.executeTool('delegate_to_reviewer', {
      task: 'Review current diff',
      context: 'Focus on regressions.'
    })

    expect(runSubagent).toHaveBeenCalledWith(
      minimalSettings(),
      expect.objectContaining({
        role: 'reviewer',
        projectPath: '/tmp/project',
        task: expect.stringContaining('Focus on regressions.')
      })
    )
    expect(output).toContain('Reviewer')
    expect(output).toContain('No critical findings.')
  })

  it('delegate_to_reviewer отображается как tool chip during execution', async () => {
    vi.mocked(runSubagent).mockResolvedValue({
      output: 'No findings.',
      steps: 1,
      completed: true,
      toolsUsed: ['git_diff']
    })
    const executor = new ToolExecutor('/tmp/project', minimalSettings(), (event) => {
      emitted.push(event)
    })

    await executor.executeParallel(
      [
        {
          id: 'call-reviewer',
          function: { name: 'delegate_to_reviewer', arguments: { task: 'Review diff' } }
        }
      ],
      1
    )

    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'tool_start', toolName: 'delegate_to_reviewer' })
      ])
    )
    expect(toolLabel('delegate_to_reviewer')).toBe('Ревью…')
  })
})
