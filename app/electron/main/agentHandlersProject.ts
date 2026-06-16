import type { ToolHandlers } from './agentTools'
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

export function createProjectToolHandlers(projectPath: string): Partial<ToolHandlers> {
  return {
    list_directory: async (args) => {
      const target = args.path?.trim() || projectPath
      if (!isInsideProject(projectPath, target)) {
        throw new Error('Доступ запрещён: папка вне проекта')
      }
      const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
      return formatFileTree(tree) || '(пусто)'
    },

    grep_files: async (args) => {
      const subpath = args.path?.trim()
      if (subpath && !isInsideProject(projectPath, subpath)) {
        throw new Error('Доступ запрещён: path вне проекта')
      }
      const result = await grepInTree(projectPath, args.query, { subpath })
      return formatGrepResults(projectPath, args.query, result)
    },

    find_files: async (args) => {
      const subpath = args.path?.trim()
      if (subpath && !isInsideProject(projectPath, subpath)) {
        throw new Error('Доступ запрещён: path вне проекта')
      }
      const result = await findFilesInTree(projectPath, args.pattern, { subpath })
      return formatFindResults(projectPath, args.pattern, result)
    },

    read_file: async (args) => {
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      return safeReadFilePartial(projectPath, args.path, offset, limit)
    },

    write_file: async (args) => {
      await safeWriteFile(projectPath, args.path, args.content)
      return `Файл записан: ${args.path}`
    },

    create_file: async (args) => {
      await safeCreateFile(projectPath, args.path, args.content)
      return `Файл создан: ${args.path}`
    },

    edit_file: async (args) => {
      const count = await safeEditFile(
        projectPath,
        args.path,
        args.old_string,
        args.new_string,
        parseToolBool(args.replace_all)
      )
      return `Файл изменён: ${args.path} (замен: ${count})`
    },

    append_file: async (args) => {
      await safeAppendFile(projectPath, args.path, args.content)
      return `Добавлено в конец: ${args.path}`
    },

    delete_file: async (args) => {
      await safeDeleteFile(projectPath, args.path)
      return `Файл удалён: ${args.path}`
    },

    move_file: async (args) => {
      await safeMoveFile(projectPath, args.from, args.to)
      return `Файл перемещён: ${args.from} → ${args.to}`
    },

    run_command: async (args) => {
      const result = await runCommand(projectPath, args.command)
      return formatCommandResult(result)
    },

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
