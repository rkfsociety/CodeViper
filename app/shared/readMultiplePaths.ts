/** Нормализует paths из tool call: массив (Gemini), JSON-строка (Ollama) или CSV. */
export function parseReadMultiplePaths(raw: unknown): string[] {
  if (raw == null) return []

  if (Array.isArray(raw)) {
    return raw.map((p) => String(p).trim()).filter(Boolean)
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim()
    if (!trimmed) return []
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed.map((p) => String(p).trim()).filter(Boolean)
      }
    } catch {
      // comma-separated fallback
    }
    return trimmed
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
  }

  const single = String(raw).trim()
  return single ? [single] : []
}
