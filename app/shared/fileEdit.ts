export class FileEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileEditError'
  }
}

export const OLD_STRING_NOT_FOUND_HINT =
  ' Для больших файлов read_* с offset/limit (средняя часть скрыта) или grep_* по уникальной подстроке — не выдумывай код, копируй из grep.'

function countOccurrences(content: string, needle: string): number {
  if (!needle) return 0
  return content.split(needle).length - 1
}

function replaceInternal(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): { content: string; replacements: number } {
  const count = countOccurrences(content, oldString)
  if (count === 0) {
    throw new FileEditError(
      'old_string не найден в файле — прочитайте файл и скопируйте точный фрагмент' +
        OLD_STRING_NOT_FOUND_HINT
    )
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

/** Пробует exact match, затем LF↔CRLF для Windows-файлов. */
function tryReplaceVariants(
  content: string,
  oldString: string,
  newString: string,
  replaceAll: boolean
): { content: string; replacements: number } | null {
  const variants: Array<[string, string, string]> = [[content, oldString, newString]]

  if (content.includes('\r\n') && !oldString.includes('\r\n')) {
    variants.push([content, oldString.replace(/\n/g, '\r\n'), newString.replace(/\n/g, '\r\n')])
  }

  if (content.includes('\r\n')) {
    const normContent = content.replace(/\r\n/g, '\n')
    const normOld = oldString.replace(/\r\n/g, '\n')
    const normNew = newString.replace(/\r\n/g, '\n')
    if (normContent !== content || normOld !== oldString) {
      variants.push([normContent, normOld, normNew])
    }
  }

  for (const [c, o, n] of variants) {
    const count = countOccurrences(c, o)
    if (count === 0) continue
    const result = replaceInternal(c, o, n, replaceAll)
    if (c === content) return result
    // Нормализованное совпадение — вернуть CRLF, если исходник был Windows
    return {
      content: content.includes('\r\n') ? result.content.replace(/\n/g, '\r\n') : result.content,
      replacements: result.replacements
    }
  }

  return null
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

  const matched = tryReplaceVariants(content, oldString, newString, replaceAll)
  if (matched) return matched

  throw new FileEditError(
    'old_string не найден в файле — прочитайте файл и скопируйте точный фрагмент' +
      OLD_STRING_NOT_FOUND_HINT
  )
}

export function parseToolBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}
