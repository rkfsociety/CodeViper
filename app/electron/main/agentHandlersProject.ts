import { readFile, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
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
import { grepInTree, formatGrepResults, findFilesInTree, formatFindResults } from './fileSearch'
import { gitStatus, gitDiff, gitLog } from './gitTools'
import { parseToolBool } from '../../shared/fileEdit'
import { parseTreeDepth, formatCommandResult } from './agentHandlersUtils'

const READONLY_ERROR = 'Режим только чтение: операции записи заблокированы'

export function createProjectToolHandlers(
  projectPath: string,
  commandTimeoutMs?: number,
  options?: { readonlyMode?: boolean }
): Partial<ToolHandlers> {
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

  return {
    list_directory: async (args) => {
      assertInsideProject(args.path, 'папка', { allowEmpty: true })
      const target = args.path?.trim() || projectPath
      const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
      return formatFileTree(tree) || '(пусто)'
    },

    grep_files: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      const result = await grepInTree(projectPath, args.query, { subpath: args.path?.trim() })
      return formatGrepResults(projectPath, args.query, result)
    },

    find_files: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      const result = await findFilesInTree(projectPath, args.pattern, {
        subpath: args.path?.trim()
      })
      return formatFindResults(projectPath, args.pattern, result)
    },

    read_file: async (args) => {
      assertInsideProject(args.path, 'файл')
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      return safeReadFilePartial(projectPath, args.path, offset, limit)
    },

    write_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      await safeWriteFile(projectPath, args.path, args.content)
      return `Файл записан: ${args.path}`
    }),

    create_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      await safeCreateFile(projectPath, args.path, args.content)
      return `Файл создан: ${args.path}`
    }),

    edit_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      if (!options?.readonlyMode) {
        try {
          const absPath = join(projectPath, args.path)
          const before = await readFile(absPath, 'utf-8')
          editSnapshots.set(absPath, before)
        } catch {
          // файл может не существовать или быть недоступен — просто не снимаем снимок
        }
      }
      const count = await safeEditFile(
        projectPath,
        args.path,
        args.old_string,
        args.new_string,
        parseToolBool(args.replace_all)
      )
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
      await safeAppendFile(projectPath, args.path, args.content)
      return `Добавлено в конец: ${args.path}`
    }),

    delete_file: guardWrite(async (args) => {
      assertInsideProject(args.path)
      await safeDeleteFile(projectPath, args.path)
      return `Файл удалён: ${args.path}`
    }),

    move_file: guardWrite(async (args) => {
      assertInsideProject(args.from, 'исходный путь')
      assertInsideProject(args.to, 'целевой путь')
      await safeMoveFile(projectPath, args.from, args.to)
      return `Файл перемещён: ${args.from} → ${args.to}`
    }),

    run_command: guardWrite(async (args) => {
      const result = await runCommand(projectPath, args.command, commandTimeoutMs)
      return formatCommandResult(result)
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
}
