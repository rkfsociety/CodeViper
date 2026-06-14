export class FileEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileEditError'
  }
}

export function applySearchReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): { content: string; replacements: number } {
  if (!oldString) {
    throw new FileEditError('old_string не может быть пустым')
  }
  if (oldString === newString) {
    throw new FileEditError('old_string и new_string совпадают')
  }

  const count = content.split(oldString).length - 1
  if (count === 0) {
    throw new FileEditError('old_string не найден в файле — прочитайте файл и скопируйте точный фрагмент')
  }
  if (!replaceAll && count > 1) {
    throw new FileEditError(
      `old_string встречается ${count} раз — добавьте больше контекста или укажите replace_all: true`
    )
  }

  const replacements = replaceAll ? count : 1
  const next = replaceAll
    ? content.split(oldString).join(newString)
    : content.replace(oldString, newString)

  return { content: next, replacements }
}

export function parseToolBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}
