import { useState, useEffect, useCallback } from 'react'
import { makeId } from '../makeId'

export interface TodoItem {
  id: string
  task: string
  status: 'pending' | 'completed'
}

export function useTodoList(chatId: string | null) {
  const [todoList, setTodoList] = useState<TodoItem[]>([])
  const storageKey = chatId ? `todoList-${chatId}` : null

  // Экспортируем setTodoList для внешнего обновления (например, от агента)
  const setTodoListFromAgent = useCallback((items: TodoItem[]) => {
    setTodoList(items)
  }, [])

  // Загрузка из localStorage при смене chatId
  useEffect(() => {
    if (!storageKey) {
      setTodoList([])
      return
    }
    try {
      const stored = localStorage.getItem(storageKey)
      if (stored) {
        setTodoList(JSON.parse(stored))
      } else {
        setTodoList([])
      }
    } catch {
      setTodoList([])
    }
  }, [storageKey])

  // Сохранение при изменении списка
  useEffect(() => {
    if (!storageKey) return
    try {
      localStorage.setItem(storageKey, JSON.stringify(todoList))
    } catch (e) {
      // игнорируем ошибки квоты
      console.warn('Failed to save todos to localStorage', e)
    }
  }, [todoList, storageKey])

  const addTask = useCallback((task: string) => {
    if (!task.trim()) return
    const newItem: TodoItem = {
      id: makeId(),
      task: task.trim(),
      status: 'pending'
    }
    setTodoList((prev) => [...prev, newItem])
  }, [])

  const toggleStatus = useCallback((id: string) => {
    setTodoList((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, status: item.status === 'pending' ? 'completed' : 'pending' }
          : item
      )
    )
  }, [])

  const deleteTask = useCallback((id: string) => {
    setTodoList((prev) => prev.filter((item) => item.id !== id))
  }, [])

  const clearCompleted = useCallback(() => {
    setTodoList((prev) => prev.filter((item) => item.status !== 'completed'))
  }, [])

  return {
    todoList,
    addTask,
    toggleStatus,
    deleteTask,
    clearCompleted,
    setTodoListFromAgent
  }
}
