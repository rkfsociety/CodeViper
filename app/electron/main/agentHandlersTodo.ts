import type { ToolHandlers } from './agentTools'
import type { AgentStreamPayload } from '../../src/types'
import type { TodoItem } from '../../src/types'

/** Нормализует поля пункта: модели часто шлют `text` вместо `title`. */
export function normalizeTodoItemInput(
  raw: Record<string, unknown>
): { id: string; title: string } | null {
  const id = raw.id
  if (id === undefined || id === null) return null
  const title = raw.title ?? raw.text ?? raw.content ?? raw.description ?? raw.task ?? raw.name
  if (title === undefined || title === null || String(title).trim() === '') return null
  return { id: String(id), title: String(title) }
}

export function createTodoToolHandlers(
  emit: (event: AgentStreamPayload) => void
): Partial<ToolHandlers> {
  const items: TodoItem[] = []

  function emitUpdate(title?: string) {
    emit({ type: 'todo_update', todoItems: [...items], content: title })
  }

  const handlers: Partial<ToolHandlers> = {
    set_todo_list: async (args: any) => {
      let rawItems: unknown[]
      try {
        const raw = args.items
        if (Array.isArray(raw)) {
          rawItems = raw
        } else {
          rawItems = JSON.parse(raw) as unknown[]
        }
        if (!Array.isArray(rawItems)) throw new Error('not array')
      } catch {
        return 'Ошибка: items должен быть массивом [{id, title|text}, ...]'
      }
      const parsed: { id: string; title: string }[] = []
      for (const entry of rawItems) {
        if (!entry || typeof entry !== 'object') continue
        const normalized = normalizeTodoItemInput(entry as Record<string, unknown>)
        if (normalized) parsed.push(normalized)
      }
      if (!parsed.length) {
        return 'Ошибка: items должен содержать хотя бы один пункт с id и title (или text)'
      }
      items.length = 0
      for (const p of parsed) {
        items.push({ id: p.id, title: p.title, done: false })
      }
      emitUpdate(args.title)
      return `Todo-лист обновлён: ${items.length} задач`
    },

    complete_todo_item: async (args: any) => {
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
  return handlers
}
