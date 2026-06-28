import { describe, it, expect } from 'vitest'
import { createTodoToolHandlers, normalizeTodoItemInput } from '../electron/main/agentHandlersTodo'
import type { AgentStreamPayload } from '../src/types'

describe('normalizeTodoItemInput', () => {
  it('принимает title', () => {
    expect(normalizeTodoItemInput({ id: 1, title: 'Задача' })).toEqual({
      id: '1',
      title: 'Задача'
    })
  })

  it('принимает text как alias для title', () => {
    expect(normalizeTodoItemInput({ id: 'a', text: 'Реализовать обработчик keydown' })).toEqual({
      id: 'a',
      title: 'Реализовать обработчик keydown'
    })
  })

  it('отклоняет пункт без текста', () => {
    expect(normalizeTodoItemInput({ id: 1 })).toBeNull()
  })
})

describe('createTodoToolHandlers — set_todo_list', () => {
  it('эмитит title из поля text', async () => {
    const events: AgentStreamPayload[] = []
    const handlers = createTodoToolHandlers((event) => events.push(event))

    const result = await handlers.set_todo_list!({
      items: [
        { id: '1', text: 'Первая задача' },
        { id: '2', title: 'Вторая задача' }
      ]
    })

    expect(result).toBe('Todo-лист обновлён: 2 задач')
    expect(events.at(-1)).toMatchObject({
      type: 'todo_update',
      todoItems: [
        { id: '1', title: 'Первая задача', done: false },
        { id: '2', title: 'Вторая задача', done: false }
      ]
    })
  })
})
