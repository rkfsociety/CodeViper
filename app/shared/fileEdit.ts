export class FileEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FileEditError'
  }
}

export const OLD_STRING_NOT_FOUND_HINT =
  ' Для больших файлов read_* с offset/limit (средняя часть скрыта) или grep_* по уникальной подстроке — не выдумывай код, копируй из grep.'

export const READ_OUTPUT_IN_EDIT_HINT =
  ' Не включай служебные строки read_* ([Файл:…], [Конец файла], «…строк обрезано…») — только код из файла.'

const READ_FILE_HEADER_RE = /^\[Файл:[^\]]*\]\s*\n?/u
const READ_TRUNCATION_HINT_RE = /^\[Средняя часть скрыта[^\]]*\]\s*\n?/u
const READ_TRUNCATION_LINE_RE = /\n\.\.\. \(\d+ строк обрезано[^\n]*\) \.\.\.\n/gu
const READ_FOOTER_RE = /\n?\[(?:Конец файла|Ещё \d+ строк[^\]]*)\]\s*$/u

/** Убирает служебные строки из ответа read_file / read_codeviper_file перед edit. */
export function stripReadOutputDecorations(text: string): string {
  let t = text
  t = t.replace(READ_FILE_HEADER_RE, '')
  t = t.replace(READ_TRUNCATION_HINT_RE, '')
  t = t.replace(READ_TRUNCATION_LINE_RE, '\n')
  t = t.replace(READ_FOOTER_RE, '')
  return t
}

export function containsReadOutputDecorations(text: string): boolean {
  return (
    READ_FILE_HEADER_RE.test(text) ||
    /\[Конец файла\]/u.test(text) ||
    /\[Ещё \d+ строк/u.test(text) ||
    /строк обрезано/u.test(text)
  )
}

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
    return {
      content: content.includes('\r\n') ? result.content.replace(/\n/g, '\r\n') : result.content,
      replacements: result.replacements
    }
  }

  return null
}

/** Подсказка с фрагментом файла, если первая строка old_string частично совпала. */
export function buildEditContextHint(content: string, oldString: string): string {
  const sanitized = stripReadOutputDecorations(oldString).trim()
  const probe = sanitized
    .split('\n')
    .find((line) => line.trim().length >= 8)
    ?.trim()
  if (!probe) return ''

  const idx = content.indexOf(probe)
  if (idx < 0) return ''

  const lineNo = content.slice(0, idx).split('\n').length
  const lineStart = content.lastIndexOf('\n', idx) + 1
  let lineEnd = content.indexOf('\n', idx)
  if (lineEnd < 0) lineEnd = content.length

  const contextStart = Math.max(0, lineStart)
  let contextEnd = lineEnd
  for (let i = 0; i < 4 && contextEnd < content.length; i++) {
    const next = content.indexOf('\n', contextEnd + 1)
    contextEnd = next < 0 ? content.length : next
  }

  const snippet = content.slice(contextStart, contextEnd).trimEnd()
  if (!snippet) return ''

  return (
    `\n\nФрагмент файла около строки ${lineNo} (скопируй отсюда, без заголовков read_*):\n` +
    `\`\`\`\n${snippet}\n\`\`\``
  )
}

function assertEditStringsClean(oldString: string, newString: string): void {
  if (containsReadOutputDecorations(newString)) {
    throw new FileEditError(
      'new_string содержит служебные строки read_* — копируй только код файла.' +
        READ_OUTPUT_IN_EDIT_HINT
    )
  }
  if (containsReadOutputDecorations(oldString)) {
    // old_string часто копируют с заголовком — stripReadOutputDecorations обработает ниже
  }
}

export function applySearchReplace(
  content: string,
  oldString: string,
  newString: string,
  replaceAll = false
): { content: string; replacements: number } {
  assertEditStringsClean(oldString, newString)

  const sanitizedOld = stripReadOutputDecorations(oldString)
  const sanitizedNew = stripReadOutputDecorations(newString)

  if (!sanitizedOld.trim()) {
    throw new FileEditError('old_string не может быть пустым')
  }
  if (sanitizedOld === sanitizedNew) {
    throw new FileEditError('old_string и new_string совпадают')
  }

  const matched = tryReplaceVariants(content, sanitizedOld, sanitizedNew, replaceAll)
  if (matched) return matched

  const contextHint = buildEditContextHint(content, sanitizedOld)
  throw new FileEditError(
    'old_string не найден в файле — прочитайте файл и скопируйте точный фрагмент' +
      OLD_STRING_NOT_FOUND_HINT +
      contextHint
  )
}

/** Блокирует запись файла, если агент случайно вставил заголовок read_*. */
export function assertFileContentNotReadOutput(content: string): void {
  if (/^\[Файл:/u.test(content.trim())) {
    throw new FileEditError(
      'content начинается со служебного заголовка read_* — это не код файла.' +
        READ_OUTPUT_IN_EDIT_HINT
    )
  }
}

export function parseToolBool(value: string | undefined): boolean {
  if (!value) return false
  const normalized = value.trim().toLowerCase()
  return normalized === 'true' || normalized === '1' || normalized === 'yes'
}
