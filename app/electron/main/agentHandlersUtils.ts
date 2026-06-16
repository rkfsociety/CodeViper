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
