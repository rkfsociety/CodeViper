import { useCallback, useRef, useState } from 'react'
import { tronStorage } from '../lib/tron'

const STORAGE_KEY = 'codeviper:terminal:history'
const MAX_HISTORY = 200

function loadHistory(): string[] {
  try {
    const data = tronStorage.getItem(STORAGE_KEY)
    return Array.isArray(data) ? (data as string[]) : []
  } catch {
    return []
  }
}

function saveHistory(history: string[]): void {
  tronStorage.setItem(STORAGE_KEY, history)
}

export function useCommandHistory() {
  const [history] = useState<string[]>(loadHistory)
  const historyRef = useRef(history)

  const push = useCallback((cmd: string) => {
    const trimmed = cmd.trim()
    if (!trimmed) return
    const next = [trimmed, ...historyRef.current.filter((c) => c !== trimmed)].slice(0, MAX_HISTORY)
    historyRef.current = next
    saveHistory(next)
  }, [])

  const getSuggestions = useCallback((input: string): string[] => {
    const q = input.trim().toLowerCase()
    if (!q) return []
    return historyRef.current.filter((c) => c.toLowerCase().includes(q)).slice(0, 8)
  }, [])

  return { push, getSuggestions }
}
