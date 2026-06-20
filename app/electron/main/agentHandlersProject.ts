import { readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { appendFileHistory, readFileHistory } from './fileHistory'
import { createUnifiedDiff } from './diffUtil'
import type { ToolHandlers } from './agentTools'
import { AgentError } from '../../shared/agentError'
import { formatFileTree } from './agentContext'
import {
  safeReadFilePartial,
  safeWriteFile,
  safeCreateFile,
  safeEditFile,
  safeAppendFile,
  safeDeleteFile,
  safeMoveFile,
  runCommand,
  buildFileTree,
  isInsideProject
} from './services'
import { formatGrepResults, formatFindResults, MAX_WALK_FILES } from './fileSearch'
import { grepInTreeWorker, findFilesInTreeWorker } from './fileSearchInWorker'
import { gitStatus, gitDiff, gitLog } from './gitTools'
import { parseToolBool } from '../../shared/fileEdit'
import { parseTreeDepth, formatCommandResult } from './agentHandlersUtils'
import { emitProgress, clearProgress } from './progress'

function scanPercent(scanned: number): number {
  return Math.min(99, Math.round((scanned / MAX_WALK_FILES) * 100))
}

const READONLY_ERROR = 'Режим только чтение: операции записи заблокированы'

export function createProjectToolHandlers(
  projectPath: string,
  commandTimeoutMs?: number,
  options?: { readonlyMode?: boolean }
): { handlers: Partial<ToolHandlers>; clearEditSnapshots: () => void } {
  const editSnapshots = new Map<string, string>()

  // Проверяет, что путь (относительный или абсолютный) после resolve остаётся
  // внутри projectPath. Защита от выхода за границы проекта (path traversal).
  // Если требуется обязательный путь, pass allowEmpty=false (дефолт).
  function assertInsideProject(
    rawPath: string | undefined,
    label = 'путь',
    options?: { allowEmpty?: boolean }
  ): void {
    const allowEmpty = options?.allowEmpty ?? false
    if (!rawPath || !rawPath.trim()) {
      if (!allowEmpty) {
        throw new AgentError(`Не указан ${label}`, 'readonly')
      }
      return
    }
    if (!isInsideProject(projectPath, resolve(projectPath, rawPath))) {
      throw new AgentError(`Доступ запрещён: ${label} вне проекта — ${rawPath}`, 'readonly')
    }
  }

  function guardWrite<T extends object>(handler: (args: T) => Promise<string>) {
    return async (args: T): Promise<string> => {
      if (options?.readonlyMode) throw new Error(READONLY_ERROR)
      return handler(args)
    }
  }

  const handlers: Partial<ToolHandlers> = {
    list_directory: async (args) => {
      assertInsideProject(args.path, 'папка', { allowEmpty: true })
      const target = args.path?.trim() || projectPath
      const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
      return formatFileTree(tree) || '(пусто)'
    },

    grep_files: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск по коду: ${args.query}`, 0)
        const result = await grepInTreeWorker(projectPath, args.query, {
          subpath: args.path?.trim(),
          onProgress: (scanned) =>
            emitProgress(`Поиск по коду: ${args.query}`, scanPercent(scanned))
        })
        return formatGrepResults(projectPath, args.query, result)
      } finally {
        clearProgress()
      }
    },

    find_files: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск файлов: ${args.pattern}`, 0)
        const result = await findFilesInTreeWorker(projectPath, args.pattern, {
          subpath: args.path?.trim(),
          onProgress: (scanned) =>
            emitProgress(`Поиск файлов: ${args.pattern}`, scanPercent(scanned))
        })
        return formatFindResults(projectPath, args.pattern, result)
      } finally {
        clearProgress()
      }
    },

    read_file: async (args) => {
      assertInsideProject(args.path, 'файл')
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      return safeReadFilePartial(projectPath, args.path, offset, limit)
    },

    write_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      let oldContent = ''
      try {
        oldContent = await readFile(join(projectPath, args.path), 'utf-8')
      } catch {
        /* новый файл */
      }
      await safeWriteFile(projectPath, args.path, args.content)
      const diff = createUnifiedDiff(oldContent, args.content, args.path)
      if (diff) void appendFileHistory({ tool: 'write_file', path: args.path, projectPath, diff })
      return `Файл записан: ${args.path}`
    }),

    create_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      await safeCreateFile(projectPath, args.path, args.content)
      const diff = createUnifiedDiff('', args.content, args.path)
      if (diff) void appendFileHistory({ tool: 'create_file', path: args.path, projectPath, diff })
      return `Файл создан: ${args.path}`
    }),

    edit_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      let beforeContent = ''
      try {
        const absPath = join(projectPath, args.path)
        beforeContent = await readFile(absPath, 'utf-8')
        editSnapshots.set(absPath, beforeContent)
      } catch {
        // файл может не существовать или быть недоступен — просто не снимаем снимок
      }
      const count = await safeEditFile(
        projectPath,
        args.path,
        args.old_string,
        args.new_string,
        parseToolBool(args.replace_all)
      )
      if (beforeContent) {
        let afterContent = ''
        try {
          afterContent = await readFile(join(projectPath, args.path), 'utf-8')
        } catch {
          /* ignore */
        }
        const diff = createUnifiedDiff(beforeContent, afterContent, args.path)
        if (diff) void appendFileHistory({ tool: 'edit_file', path: args.path, projectPath, diff })
      }
      return `Файл изменён: ${args.path} (замен: ${count})`
    }),

    undo_edit: async (args) => {
      assertInsideProject(args.path)
      const absPath = join(projectPath, args.path)
      const snapshot = editSnapshots.get(absPath)
      if (!snapshot) throw new Error(`Нет снимка для файла: ${args.path}`)
      await writeFile(absPath, snapshot, 'utf-8')
      editSnapshots.delete(absPath)
      return `Файл восстановлен: ${args.path}`
    },

    append_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      let oldContent = ''
      try {
        oldContent = await readFile(join(projectPath, args.path), 'utf-8')
      } catch {
        /* ignore */
      }
      await safeAppendFile(projectPath, args.path, args.content)
      const newContent = oldContent + args.content
      const diff = createUnifiedDiff(oldContent, newContent, args.path)
      if (diff) void appendFileHistory({ tool: 'append_file', path: args.path, projectPath, diff })
      return `Добавлено в конец: ${args.path}`
    }),

    delete_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      let oldContent = ''
      try {
        oldContent = await readFile(join(projectPath, args.path), 'utf-8')
      } catch {
        /* ignore */
      }
      await safeDeleteFile(projectPath, args.path)
      const diff = createUnifiedDiff(oldContent, '', args.path)
      if (diff) void appendFileHistory({ tool: 'delete_file', path: args.path, projectPath, diff })
      return `Файл удалён: ${args.path}`
    }),

    move_file: guardWrite(async (args) => {
      assertInsideProject(args.from, 'исходный путь')
      assertInsideProject(args.to, 'целевой путь')
      await safeMoveFile(projectPath, args.from, args.to)
      void appendFileHistory({
        tool: 'move_file',
        path: args.from,
        projectPath,
        diff: `(перемещён в ${args.to})`
      })
      return `Файл перемещён: ${args.from} → ${args.to}`
    }),

    show_file_history: async (args) => {
      assertInsideProject(args.path)
      const entries = await readFileHistory(projectPath, args.path)
      if (!entries.length) return `История правок для ${args.path} пуста.`
      const MAX_DIFF_LINES = 60
      const lines: string[] = [`История правок: ${args.path} (записей: ${entries.length})\n`]
      for (const [i, e] of entries.entries()) {
        const date = new Date(e.ts).toLocaleString('ru-RU')
        lines.push(`── [${i + 1}] ${date}  ${e.tool} ──`)
        const diffLines = e.diff.split('\n')
        if (diffLines.length > MAX_DIFF_LINES) {
          lines.push(diffLines.slice(0, MAX_DIFF_LINES).join('\n'))
          lines.push(`... (ещё ${diffLines.length - MAX_DIFF_LINES} строк)`)
        } else {
          lines.push(e.diff)
        }
      }
      return lines.join('\n')
    },

    run_command: guardWrite(async (args) => {
      try {
        // Длительность команды неизвестна заранее — индикатор без процента.
        emitProgress(`Выполняю: ${args.command}`, null)
        const result = await runCommand(projectPath, args.command, commandTimeoutMs)
        return formatCommandResult(result)
      } finally {
        clearProgress()
      }
    }),

    git_status: async (args) => gitStatus(projectPath, args.path),

    git_diff: async (args) =>
      gitDiff(projectPath, {
        path: args.path,
        staged: args.staged,
        commit: args.commit
      }),

    git_log: async (args) =>
      gitLog(projectPath, {
        limit: args.limit,
        path: args.path,
        oneline: args.oneline
      })
  }

  return { handlers, clearEditSnapshots: () => editSnapshots.clear() }
}
