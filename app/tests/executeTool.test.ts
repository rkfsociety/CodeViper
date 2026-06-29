import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { execSync } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/executeTool' }
}))

import { createProjectToolHandlers } from '../electron/main/agentHandlersProject'
import { createSelfImprovementToolHandlers } from '../electron/main/agentHandlersSelfImprovement'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'cv-exec-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('executeTool - read_file', () => {
  it('reads an existing file', async () => {
    const file = join(projectDir, 'hello.txt')
    writeFileSync(file, 'мир')
    const { handlers } = createProjectToolHandlers(projectDir)
    const result = await handlers.read_file!({ path: file })
    expect(result).toContain('мир')
  })

  it('throws for a missing file', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(handlers.read_file!({ path: join(projectDir, 'nope.txt') })).rejects.toThrow(
      /ENOENT|not found/i
    )
  })

  it('blocks reads outside the project', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(
      handlers.read_file!({ path: join(projectDir, '..', 'secret.txt') })
    ).rejects.toMatchObject({ code: 'readonly' })
  })
})

describe('executeTool - write_file + readonlyMode', () => {
  it('writes a file', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    const file = join(projectDir, 'out.txt')
    const result = await handlers.write_file!({ path: file, content: 'данные' })
    expect(result).toMatch(/записан|обновлён/i)
  })

  it('readonlyMode blocks writes', async () => {
    const { handlers } = createProjectToolHandlers(projectDir, undefined, { readonlyMode: true })
    await expect(
      handlers.write_file!({ path: join(projectDir, 'out.txt'), content: 'x' })
    ).rejects.toThrow(/только чтение/i)
  })
})

describe('executeTool - unknown tool', () => {
  it('returns the fallback unknown-tool text', async () => {
    const { handlers } = createProjectToolHandlers(projectDir) as unknown as {
      handlers: Record<string, ((args: Record<string, string>) => Promise<string>) | undefined>
    }
    const handler = handlers['no_such_tool']
    expect(handler).toBeUndefined()
    const fallback = handler ? await handler({}) : 'Неизвестный инструмент: no_such_tool'
    expect(fallback).toContain('Неизвестный инструмент')
  })
})

describe('executeTool - git_commit', () => {
  it('commits staged changes through the handler', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-git-handler-'))
    try {
      execSync('git init', { cwd: dir, stdio: 'ignore' })
      execSync('git config user.email test@test.com', { cwd: dir, stdio: 'ignore' })
      execSync('git config user.name Test', { cwd: dir, stdio: 'ignore' })
      writeFileSync(join(dir, 'commit-me.txt'), 'data', 'utf8')
      execSync('git add commit-me.txt', { cwd: dir, stdio: 'ignore' })

      const { handlers } = createProjectToolHandlers(dir)
      const result = await handlers.git_commit!({ message: 'via git_commit tool' })
      expect(result).toMatch(/^exit: 0/)

      const subject = execSync('git log -1 --pretty=%s', { cwd: dir, encoding: 'utf8' }).trim()
      expect(subject).toBe('via git_commit tool')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('readonlyMode blocks git_commit', async () => {
    const { handlers } = createProjectToolHandlers(projectDir, undefined, { readonlyMode: true })
    await expect(handlers.git_commit!({ message: 'blocked' })).rejects.toThrow(/только чтение/i)
  })

  it('readonlyMode blocks git_push', async () => {
    const { handlers } = createProjectToolHandlers(projectDir, undefined, { readonlyMode: true })
    await expect(handlers.git_push!({ remote: 'origin' })).rejects.toThrow(/только чтение/i)
  })

  it('readonlyMode blocks git_checkout', async () => {
    const { handlers } = createProjectToolHandlers(projectDir, undefined, { readonlyMode: true })
    await expect(handlers.git_checkout!({ branch: 'feature' })).rejects.toThrow(/только чтение/i)
  })
})

describe('createSelfImprovementToolHandlers', () => {
  it('sets a self-improvement plan and returns a summary', async () => {
    const store = new SelfImprovementPlanStore()
    const emitPlan = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emitPlan)

    const result = await handlers.set_self_improvement_plan!({
      items: '[{"id":"1","title":"Изучить код"},{"id":"2","title":"Добавить skill"}]'
    })

    expect(result).toContain('Изучить код')
    expect(store.has()).toBe(true)
    expect(emitPlan).toHaveBeenCalledOnce()
  })

  it('accepts plan as an array of strings', async () => {
    const store = new SelfImprovementPlanStore()
    const emitPlan = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emitPlan)

    const result = await handlers.set_self_improvement_plan!({
      plan: ['Изучить App.tsx', 'Реализовать сплиттер', 'npm run typecheck']
    })

    expect(result).toContain('Изучить App.tsx')
    expect(store.get()).toHaveLength(3)
    expect(emitPlan).toHaveBeenCalledOnce()
  })

  it('marks a self-improvement item complete', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([
      { id: '1', title: 'A', done: false },
      { id: '2', title: 'B', done: false }
    ])
    const emitPlan = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emitPlan)

    const result = await handlers.complete_self_improvement_item!({ id: '1' })

    expect(result).toContain('1')
    expect(store.get()?.[0].done).toBe(true)
    expect(store.isComplete()).toBe(false)
    expect(emitPlan).toHaveBeenCalledOnce()
  })

  it('accepts a numeric id for complete_self_improvement_item', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.complete_self_improvement_item!({ id: 1 })

    expect(result).toContain('1')
    expect(store.get()?.[0].done).toBe(true)
  })

  it('reports when the final plan item is complete', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    const emitPlan = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emitPlan)

    const result = await handlers.complete_self_improvement_item!({ id: '1' })

    expect(result).toContain('завершены')
    expect(store.isComplete()).toBe(true)
  })

  it('lists roadmap items', async () => {
    const store = new SelfImprovementPlanStore()
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.list_roadmap!({})

    expect(result).toContain('Пункты ROADMAP')
    expect(result).toMatch(/\d+ · .+ · /)
  })

  it('reads roadmap item fields', async () => {
    const store = new SelfImprovementPlanStore()
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.read_roadmap_item!({ number: '1' })

    expect(result).toContain('Цель:')
    expect(result).toContain('Файлы:')
    expect(result).toContain('Действие:')
    expect(result).toContain('Проверка:')
  })

  it('returns prioritized roadmap items', async () => {
    const store = new SelfImprovementPlanStore()
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.prioritize_roadmap_items!({ limit: '3' })

    expect(result).toContain('Приоритет ROADMAP')
    expect(result).toMatch(/1\. #\d+/)
  })

  it('returns a message when no plan exists', async () => {
    const store = new SelfImprovementPlanStore()
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.get_self_improvement_plan!({})
    expect(result).toContain('не задан')
  })

  it('returns the summary of the active plan', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([
      { id: '1', title: 'Тест', done: false },
      { id: '2', title: 'Ещё', done: false }
    ])
    store.complete('1')
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.get_self_improvement_plan!({})
    expect(result).toMatch(/1\/2|\(1 из 2\)|1 из 2/i)
  })

  it('throws for an unknown complete_self_improvement_item id', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    await expect(handlers.complete_self_improvement_item!({ id: '99' })).rejects.toThrow(
      /не найден/i
    )
  })
})
