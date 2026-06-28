/** Возвращает текст ошибки, если обязательный строковый аргумент инструмента пуст. */
export function missingToolArg(label: string): string {
  return `Не указан параметр ${label}`
}

/** path из args.path, paths[0] (Gemini), file_path — для grep/find. */
export function resolveToolPathArg(args: Record<string, unknown>): string | undefined {
  const direct = String(args.path ?? '').trim()
  if (direct) return direct

  const paths = args.paths
  if (Array.isArray(paths) && paths.length > 0) {
    const first = String(paths[0]).trim()
    if (first) return first
  }
  if (typeof paths === 'string') {
    const trimmed = paths.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (Array.isArray(parsed) && parsed.length > 0) {
          const first = String(parsed[0]).trim()
          if (first) return first
        }
      } catch {
        // не JSON — ниже
      }
    }
    if (trimmed) return trimmed
  }

  const filePath = String(args.file_path ?? args.filePath ?? '').trim()
  return filePath || undefined
}

/** Разбор глубины дерева файлов из строкового аргумента инструмента. */
export function parseTreeDepth(value: string | undefined): number {
  const depth = Number(value)
  if (!Number.isFinite(depth)) return 3
  return Math.min(5, Math.max(1, Math.round(depth)))
}

/** Форматирует результат shell-команды в читаемую строку. */
export function formatCommandResult(result: {
  exitCode: number | null
  stdout: string
  stderr: string
}): string {
  return [
    `exit: ${result.exitCode}`,
    result.stdout ? `stdout:\n${result.stdout}` : '',
    result.stderr ? `stderr:\n${result.stderr}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}
