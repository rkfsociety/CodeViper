import type { ToolHandlers } from './agentTools'
import {
  getCodeViperSourceRoot,
  readCodeViperFilePartial,
  createCodeViperFile,
  editCodeViperFile,
  appendCodeViperFile,
  deleteCodeViperFile,
  moveCodeViperFile,
  runCodeViperCommand,
  writeCodeViperFile,
  isAllowedSelfPath
} from './codeviperSource'
import { createCodeViperBranch, pushCodeViperBranch, createCodeViperPr } from './selfCommit'
import { buildFileTree } from './services'
import { formatFileTree } from './agentContext'
import { grepInTree, formatGrepResults, findFilesInTree, formatFindResults } from './fileSearch'
import { parseToolBool } from '../../shared/fileEdit'
import { parseTreeDepth, formatCommandResult } from './agentHandlersUtils'

export function createCodeViperToolHandlers(): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    list_codeviper_directory: async (args) => {
      const root = getCodeViperSourceRoot()
      const target = args.path?.trim() || root
      if (!isAllowedSelfPath(root, target)) {
        throw new Error('Доступ запрещён: путь вне исходников CodeViper')
      }
      const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
      return formatFileTree(tree) || '(пусто)'
    },

    grep_codeviper_files: async (args) => {
      const root = getCodeViperSourceRoot()
      const subpath = args.path?.trim()
      if (subpath && !isAllowedSelfPath(root, subpath)) {
        throw new Error('Доступ запрещён: path вне исходников CodeViper')
      }
      const result = await grepInTree(root, args.query, { subpath })
      return formatGrepResults(root, args.query, result)
    },

    find_codeviper_files: async (args) => {
      const root = getCodeViperSourceRoot()
      const subpath = args.path?.trim()
      if (subpath && !isAllowedSelfPath(root, subpath)) {
        throw new Error('Доступ запрещён: path вне исходников CodeViper')
      }
      const result = await findFilesInTree(root, args.pattern, { subpath })
      return formatFindResults(root, args.pattern, result)
    },

    read_codeviper_file: async (args) => {
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      return readCodeViperFilePartial(args.path, offset, limit)
    },

    write_codeviper_file: async (args) => {
      await writeCodeViperFile(args.path, args.content)
      return `Файл CodeViper записан: ${args.path}`
    },

    create_codeviper_file: async (args) => {
      await createCodeViperFile(args.path, args.content)
      return `Файл CodeViper создан: ${args.path}`
    },

    edit_codeviper_file: async (args) => {
      const count = await editCodeViperFile(
        args.path,
        args.old_string,
        args.new_string,
        parseToolBool(args.replace_all)
      )
      return `Файл CodeViper изменён: ${args.path} (замен: ${count})`
    },

    append_codeviper_file: async (args) => {
      await appendCodeViperFile(args.path, args.content)
      return `Добавлено в конец CodeViper: ${args.path}`
    },

    delete_codeviper_file: async (args) => {
      await deleteCodeViperFile(args.path)
      return `Файл CodeViper удалён: ${args.path}`
    },

    move_codeviper_file: async (args) => {
      await moveCodeViperFile(args.from, args.to)
      return `Файл CodeViper перемещён: ${args.from} → ${args.to}`
    },

    run_codeviper_command: async (args) => {
      const result = await runCodeViperCommand(args.command)
      return formatCommandResult(result)
    },

    create_codeviper_branch: async (args) => {
      const result = await createCodeViperBranch(args.name)
      if (!result.ok) throw new Error(result.message)
      return result.message
    },

    push_codeviper_branch: async (_args) => {
      const result = await pushCodeViperBranch()
      if (!result.ok) throw new Error(result.message)
      return result.message
    },

    create_codeviper_pr: async (args) => {
      const result = await createCodeViperPr(args.title, args.body)
      if (!result.ok) throw new Error(result.message)
      return result.message
    }
  }
  return handlers
}
