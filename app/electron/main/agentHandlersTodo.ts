import type { ToolHandlers } from './agentTools'
import type { AgentStreamPayload } from '../../src/types'
import type { TodoItem } from '../../src/types'

export function createTodoToolHandlers(
  emit: (event: AgentStreamPayload) => void
): Partial<ToolHandlers> {
  const items: TodoItem[] = []

  function emitUpdate(title?: string) {
    emit({ type: 'todo_update', todoItems: [...items], content: title })
  }

  return {
    set_todo_list: async (args) => {
      let parsed: { id: string; title: string }[]
      try {
        parsed = JSON.parse(args.items) as { id: string; title: string }[]
        if (!Array.isArray(parsed)) throw new Error('not array')
      } catch {
        return 'Ошибка: items должен быть JSON-массивом [{id, title}, ...]'
      }
      items.length = 0
      for (const p of parsed) {
        items.push({ id: String(p.id), title: String(p.title), done: false })
      }
      emitUpdate(args.title)
      return `Todo-лист обновлён: ${items.length} задач`
    },

    complete_todo_item: async (args) => {
      const item = items.find((i) => i.id === args.id)
      if (!item) return `Задача с id="${args.id}" не найдена в todo-листе`
      item.done = true
      emitUpdate()
      const pending = items.filter((i) => !i.done)
      if (!pending.length) return `Задача "${item.title}" выполнена. Все задачи завершены.`
      return `Задача "${item.title}" выполнена. Осталось: ${pending.length}`
    },

    clear_todo_list: async () => {
      items.length = 0
      emitUpdate()
      return 'Todo-лист скрыт'
    }
  }
}
