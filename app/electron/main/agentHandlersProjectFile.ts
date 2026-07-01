import { readFile, stat, writeFile } from 'fs/promises'
import { join, resolve } from 'path'
import { appendFileHistory, readFileHistory } from './fileHistory'
import { createUnifiedDiff } from './diffUtil'
import type { ToolHandlers } from './agentTools'
import { formatFileTree } from './agentContext'
import {
  formatProjectReadErrorHint,
  safeReadFilePartial,
  safeWriteFile,
  safeCreateFile,
  safeEditFile,
  safeAppendFile,
  safeDeleteFile,
  safeCopyFile,
  safeCopyFolder,
  safeMoveFile,
  safeMoveFolder,
  buildFileTree
} from './services'
import { parseToolBool } from '../../shared/fileEdit'
import { parseReadMultiplePaths } from '../../shared/readMultiplePaths'
import { parseTreeDepth, resolveEditToolArgs } from './agentHandlersUtils'
import { gitLog } from './gitTools'
import type { ProjectHandlerContext } from './agentHandlersProjectContext'

function countTree(
  nodes: Array<{
    isDirectory: boolean
    children?: Array<{ isDirectory: boolean; children?: never[] }>
  }>
): { files: number; dirs: number } {
  let files = 0
  let dirs = 0
  const walk = (items: typeof nodes): void => {
    for (const item of items) {
      if (item.isDirectory) {
        dirs += 1
        if (item.children?.length) walk(item.children as typeof nodes)
      } else {
        files += 1
      }
    }
  }
  walk(nodes)
  return { files, dirs }
}

export function createFileHandlers(ctx: ProjectHandlerContext): Partial<ToolHandlers> {
  const { projectPath, assertInsideProject, guardWrite, editSnapshots } = ctx

  return {
    list_directory: async (args) => {
      assertInsideProject(args.path, 'папка', { allowEmpty: true })
      const relPath = args.path?.trim() ?? ''
      const target = relPath ? resolve(projectPath, relPath) : projectPath
      try {
        const tree = await buildFileTree(target, 0, parseTreeDepth(args.max_depth))
        return formatFileTree(tree) || '(пусто)'
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const enriched = await formatProjectReadErrorHint(projectPath, relPath || '.', message)
        throw new Error(enriched)
      }
    },

    read_file: async (args) => {
      assertInsideProject(args.path, 'файл')
      const offset = args.offset ? parseInt(args.offset, 10) : 0
      const limit = args.limit ? parseInt(args.limit, 10) : undefined
      try {
        return await safeReadFilePartial(projectPath, args.path, offset, limit)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        const enriched = await formatProjectReadErrorHint(projectPath, args.path, message)
        throw new Error(enriched)
      }
    },

    read_multiple_files: async (args) => {
      const paths = parseReadMultiplePaths(args.paths)
      if (!paths.length) {
        return 'Ошибка: paths пуст — укажи массив путей к файлам'
      }
      const results = await Promise.all(
        paths.map(async (path: string) => {
          try {
            assertInsideProject(path, 'файл')
            const content = await safeReadFilePartial(projectPath, path, 0, undefined)
            return { path, content }
          } catch (e) {
            return { path, content: `Ошибка: ${e instanceof Error ? e.message : String(e)}` }
          }
        })
      )
      return JSON.stringify(results)
    },

    file_info: async (args) => {
      assertInsideProject(args.path, 'файл')
      const absPath = resolve(projectPath, args.path)
      const info = await stat(absPath)
      if (!info.isFile()) return `Это не файл: ${args.path}`

      const maxPreviewBytes = 128 * 1024
      let text = ''
      let binary = false
      try {
        const buffer = await readFile(absPath)
        binary = buffer.includes(0)
        if (!binary) text = buffer.toString('utf8')
      } catch {
        return `Ошибка чтения файла: ${args.path}`
      }

      const lines = binary ? null : text.split('\n').length
      const words = binary ? null : (text.match(/\S+/g)?.length ?? 0)
      const chars = binary ? null : text.length
      const truncated = info.size > maxPreviewBytes ? 'да' : 'нет'

      return [
        `Файл: ${args.path}`,
        `Размер: ${info.size} байт`,
        `Изменён: ${info.mtime.toLocaleString('ru-RU')}`,
        `Бинарный: ${binary ? 'да' : 'нет'}`,
        `Показывать как большой: ${truncated}`,
        ...(lines != null ? [`Строк: ${lines}`] : []),
        ...(words != null ? [`Слов: ${words}`] : []),
        ...(chars != null ? [`Символов: ${chars}`] : [])
      ].join('\n')
    },

    project_stats: async (args) => {
      assertInsideProject(args.path, 'папка', { allowEmpty: true })
      const target = args.path?.trim() ? resolve(projectPath, args.path.trim()) : projectPath
      const tree = await buildFileTree(target, 0, 5)
      const counts = countTree(tree as Parameters<typeof countTree>[0])
      const topLevel = tree.slice(0, 12).map((node) => `${node.name}${node.isDirectory ? '/' : ''}`)
      const recentCommits = await gitLog(projectPath, { limit: '5', oneline: 'true' }).catch(
        () => '(git log недоступен)'
      )

      return [
        `Проект: ${target}`,
        `Папок: ${counts.dirs}`,
        `Файлов: ${counts.files}`,
        `Верхний уровень: ${topLevel.join(', ') || '(пусто)'}`,
        '',
        'Последние коммиты:',
        recentCommits
      ].join('\n')
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
      const resolved = resolveEditToolArgs(args as Record<string, unknown>)
      if (!resolved.ok) throw new Error(resolved.error)
      const { path, old_string, new_string, replace_all } = resolved.args
      assertInsideProject(path)
      let beforeContent = ''
      try {
        const absPath = join(projectPath, path)
        beforeContent = await readFile(absPath, 'utf-8')
        editSnapshots.set(absPath, beforeContent)
      } catch {
        // файл может не существовать или быть недоступен
      }
      const count = await safeEditFile(
        projectPath,
        path,
        old_string,
        new_string,
        parseToolBool(replace_all)
      )
      if (beforeContent) {
        let afterContent = ''
        try {
          afterContent = await readFile(join(projectPath, path), 'utf-8')
        } catch {
          /* ignore */
        }
        const diff = createUnifiedDiff(beforeContent, afterContent, path)
        if (diff) void appendFileHistory({ tool: 'edit_file', path, projectPath, diff })
      }
      return `Файл изменён: ${path} (замен: ${count})`
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

    copy_file: guardWrite(async (args) => {
      assertInsideProject(args.from, 'исходный путь')
      assertInsideProject(args.to, 'целевой путь')
      await safeCopyFile(projectPath, args.from, args.to)
      return `Файл скопирован: ${args.from} → ${args.to}`
    }),

    rename_folder: guardWrite(async (args) => {
      assertInsideProject(args.from, 'исходная папка')
      assertInsideProject(args.to, 'целевая папка')
      await safeMoveFolder(projectPath, args.from, args.to)
      return `Папка перемещена: ${args.from} → ${args.to}`
    }),

    copy_folder: guardWrite(async (args) => {
      assertInsideProject(args.from, 'исходная папка')
      assertInsideProject(args.to, 'целевая папка')
      await safeCopyFolder(projectPath, args.from, args.to)
      return `Папка скопирована: ${args.from} → ${args.to}`
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
    }
  }
}
