/** Возвращает текст ошибки, если обязательный строковый аргумент инструмента пуст. */
export function missingToolArg(label: string): string {
  return `Не указан параметр ${label}`
}

export type ResolvedEditArgs = {
  path: string
  old_string: string
  new_string: string
  replace_all?: string
}

export type ResolveEditToolArgsResult =
  | { ok: true; args: ResolvedEditArgs }
  | { ok: false; error: string }

/** path + old_string + new_string для edit_file / edit_codeviper_file (с алиасами path). */
export function resolveEditToolArgs(args: Record<string, unknown>): ResolveEditToolArgsResult {
  const path = resolveToolPathArg(args)
  if (!path) {
    return {
      ok: false,
      error: `${missingToolArg('path')} Укажи path (или file_path).`
    }
  }

  const oldString = String(args.old_string ?? args.oldString ?? '')
  const hasOld = oldString.length > 0
  const contentBody = String(args.content ?? args.new_content ?? '').trim()
  const hasNewContentAlias = contentBody.length > 0

  if (!hasOld && hasNewContentAlias) {
    return {
      ok: false,
      error:
        'edit_* требует path, old_string и new_string (точечная замена фрагмента). ' +
        'Параметры content/new_content не принимаются. ' +
        'Сначала read_* — скопируй точный фрагмент в old_string. ' +
        'Новый файл → create_*; полная перезапись → write_*.'
    }
  }

  if (!hasOld) {
    return {
      ok: false,
      error: `${missingToolArg('old_string')} Прочитай файл и скопируй точный фрагмент для замены.`
    }
  }

  const newRaw = args.new_string ?? args.newString
  let newString: string
  if (newRaw !== undefined && newRaw !== null) {
    newString = String(newRaw)
  } else if (hasNewContentAlias) {
    newString = contentBody
  } else {
    return {
      ok: false,
      error: `${missingToolArg('new_string')} Укажи новый фрагмент (может быть пустой строкой для удаления).`
    }
  }

  const replaceAll = args.replace_all ?? args.replaceAll
  return {
    ok: true,
    args: {
      path,
      old_string: oldString,
      new_string: newString,
      ...(replaceAll !== undefined ? { replace_all: String(replaceAll) } : {})
    }
  }
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
