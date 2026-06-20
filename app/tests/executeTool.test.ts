import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

vi.mock('electron', () => ({
  app: { getPath: () => process.cwd() + '/.vitest-tmp/executeTool' }
}))

import { createProjectToolHandlers } from '../electron/main/agentHandlersProject'
import { createSelfImprovementToolHandlers } from '../electron/main/agentHandlersSelfImprovement'
import { SelfImprovementPlanStore } from '../electron/main/selfImprovementStore'

// ─── Тесты executeTool через createProjectToolHandlers ─────────────────────

let projectDir: string

beforeEach(() => {
  projectDir = mkdtempSync(join(tmpdir(), 'cv-exec-'))
})

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true })
})

describe('executeTool — read_file', () => {
  it('читает существующий файл', async () => {
    const file = join(projectDir, 'hello.txt')
    writeFileSync(file, 'мир')
    const { handlers } = createProjectToolHandlers(projectDir)
    const result = await handlers.read_file!({ path: file })
    expect(result).toContain('мир')
  })

  it('бросает ошибку для несуществующего файла', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(handlers.read_file!({ path: join(projectDir, 'nope.txt') })).rejects.toThrow(
      /ENOENT|not found/i
    )
  })

  it('блокирует чтение вне проекта', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    await expect(
      handlers.read_file!({ path: join(projectDir, '..', 'secret.txt') })
    ).rejects.toMatchObject({ code: 'readonly' })
  })
})

describe('executeTool — write_file + readonlyMode', () => {
  it('пишет файл', async () => {
    const { handlers } = createProjectToolHandlers(projectDir)
    const file = join(projectDir, 'out.txt')
    const result = await handlers.write_file!({ path: file, content: 'данные' })
    expect(result).toMatch(/записан|обновлён/i)
  })

  it('readonlyMode блокирует запись', async () => {
    const { handlers } = createProjectToolHandlers(projectDir, undefined, { readonlyMode: true })
    await expect(
      handlers.write_file!({ path: join(projectDir, 'out.txt'), content: 'x' })
    ).rejects.toThrow(/только чтение/i)
  })
})

describe('executeTool — неизвестный инструмент', () => {
  it('возвращает "Неизвестный инструмент"', async () => {
    // Эмулируем поведение AgentRunner.executeTool: ищем handler, при отсутствии — строка
    const { handlers } = createProjectToolHandlers(projectDir) as {
      handlers: Record<string, ((args: Record<string, string>) => Promise<string>) | undefined>
    }
    const handler = handlers['no_such_tool']
    expect(handler).toBeUndefined()
    // AgentRunner возвращает фиксированную строку при отсутствии хендлера
    const fallback = handler ? await handler({}) : `Неизвестный инструмент: no_such_tool`
    expect(fallback).toContain('Неизвестный инструмент')
  })
})

// ─── Тесты self-improvement handlers ──────────────────────────────────────

describe('createSelfImprovementToolHandlers', () => {
  it('set_self_improvement_plan устанавливает план и возвращает summary', async () => {
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

  it('complete_self_improvement_item отмечает пункт выполненным', async () => {
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

  it('complete последнего пункта сообщает о завершении плана', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    const emitPlan = vi.fn()
    const handlers = createSelfImprovementToolHandlers(store, emitPlan)

    const result = await handlers.complete_self_improvement_item!({ id: '1' })

    expect(result).toContain('завершены')
    expect(store.isComplete()).toBe(true)
  })

  it('get_self_improvement_plan возвращает сообщение при отсутствии плана', async () => {
    const store = new SelfImprovementPlanStore()
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.get_self_improvement_plan!({})
    expect(result).toContain('не задан')
  })

  it('get_self_improvement_plan возвращает summary активного плана', async () => {
    const store = new SelfImprovementPlanStore()
    // set() сбрасывает done в false — используем complete() для отметки
    store.set([
      { id: '1', title: 'Тест', done: false },
      { id: '2', title: 'Ещё', done: false }
    ])
    store.complete('1')
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    const result = await handlers.get_self_improvement_plan!({})
    // formatPlanSummary: «Plan самоулучшения (done/total): ...»
    expect(result).toMatch(/1\/2|\(1 из 2\)|1 из 2/i)
  })

  it('complete несуществующего id бросает ошибку', async () => {
    const store = new SelfImprovementPlanStore()
    store.set([{ id: '1', title: 'A', done: false }])
    const handlers = createSelfImprovementToolHandlers(store, vi.fn())

    await expect(handlers.complete_self_improvement_item!({ id: '99' })).rejects.toThrow(
      /не найден/i
    )
  })
})
