import { resolve } from 'path'
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
  isAllowedSelfPath,
  normalizeCodeViperPath
} from './codeviperSource'
import { createCodeViperBranch, pushCodeViperBranch, createCodeViperPr } from './selfCommit'
import { buildFileTree } from './services'
import { formatFileTree } from './agentContext'
import { grepInTree, formatGrepResults, findFilesInTree, formatFindResults } from './fileSearch'
import { parseToolBool } from '../../shared/fileEdit'
import {
  parseTreeDepth,
  formatCommandResult,
  missingToolArg,
  resolveEditToolArgs,
  resolveToolContentArg,
  resolveToolPathArg
} from './agentHandlersUtils'
import { formatCodeViperEnoentHint } from './codeviperSource'

export function createCodeViperToolHandlers(): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    list_codeviper_directory: async (args) => {
      const root = getCodeViperSourceRoot()
      const target = args.path?.trim()
        ? resolve(root, normalizeCodeViperPath(root, args.path.trim()))
        : root
      if (!isAllowedSelfPath(root, target)) {
        throw new Error('Доступ запрещён: путь вне исходников CodeViper')
      }
      const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
      return formatFileTree(tree) || '(пусто)'
    },

    grep_codeviper_files: async (args) => {
      const query = args.query?.trim()
      if (!query) return missingToolArg('query (текст или /regex/i для поиска)')
      const root = getCodeViperSourceRoot()
      const pathArg = resolveToolPathArg(args as Record<string, unknown>)
      const subpath = pathArg ? normalizeCodeViperPath(root, pathArg) : undefined
      if (subpath && !isAllowedSelfPath(root, subpath)) {
        throw new Error('Доступ запрещён: path вне исходников CodeViper')
      }
      const result = await grepInTree(root, query, { subpath })
      return formatGrepResults(root, query, result)
    },

    find_codeviper_files: async (args) => {
      const pattern = args.pattern?.trim()
      if (!pattern) return missingToolArg('pattern (имя или glob, напр. *.ts)')
      const root = getCodeViperSourceRoot()
      const pathArg = resolveToolPathArg(args as Record<string, unknown>)
      const subpath = pathArg ? normalizeCodeViperPath(root, pathArg) : undefined
      if (subpath && !isAllowedSelfPath(root, subpath)) {
        throw new Error('Доступ запрещён: path вне исходников CodeViper')
      }
      const result = await findFilesInTree(root, pattern, { subpath })
      return formatFindResults(root, pattern, result)
    },

    read_codeviper_file: async (args) => {
      const path = resolveToolPathArg(args as Record<string, unknown>)
      if (!path) throw new Error(missingToolArg('path'))
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      try {
        return await readCodeViperFilePartial(path, offset, limit)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        throw new Error(await formatCodeViperEnoentHint(msg, path))
      }
    },

    write_codeviper_file: async (args) => {
      const path = resolveToolPathArg(args as Record<string, unknown>)
      if (!path) throw new Error(missingToolArg('path'))
      const content = resolveToolContentArg(args as Record<string, unknown>)
      if (content === undefined) {
        throw new Error(
          `${missingToolArg('content')} write_codeviper_file требует полное содержимое файла.`
        )
      }
      await writeCodeViperFile(path, content)
      return `Файл CodeViper записан: ${path}`
    },

    create_codeviper_file: async (args) => {
      const path = resolveToolPathArg(args as Record<string, unknown>)
      if (!path) throw new Error(missingToolArg('path'))
      const content = resolveToolContentArg(args as Record<string, unknown>)
      if (content === undefined) {
        throw new Error(
          `${missingToolArg('content')} create_codeviper_file требует полное содержимое нового файла.`
        )
      }
      await createCodeViperFile(path, content)
      return `Файл CodeViper создан: ${path}`
    },

    edit_codeviper_file: async (args) => {
      const resolved = resolveEditToolArgs(args as Record<string, unknown>)
      if (!resolved.ok) throw new Error(resolved.error)
      const { path, old_string, new_string, replace_all } = resolved.args
      const count = await editCodeViperFile(
        path,
        old_string,
        new_string,
        parseToolBool(replace_all)
      )
      return `Файл CodeViper изменён: ${path} (замен: ${count})`
    },

    append_codeviper_file: async (args) => {
      const path = resolveToolPathArg(args as Record<string, unknown>)
      if (!path) throw new Error(missingToolArg('path'))
      const content = resolveToolContentArg(args as Record<string, unknown>)
      if (content === undefined) {
        throw new Error(
          `${missingToolArg('content')} append_codeviper_file требует текст для добавления.`
        )
      }
      await appendCodeViperFile(path, content)
      return `Добавлено в конец CodeViper: ${path}`
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
