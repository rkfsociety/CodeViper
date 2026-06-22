import { createHash } from 'crypto'
import { readFile, readdir, stat, writeFile } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
import { QdrantClient } from '@qdrant/js-client-rest'
import { computeEmbedding } from './embeddings'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'
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
  safeCopyFile,
  safeCopyFolder,
  safeMoveFile,
  safeMoveFolder,
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

interface ProjectToolOptions {
  readonlyMode?: boolean
  ollamaUrl?: string
  qdrantUrl?: string
  qdrantApiKey?: string
  commandBlocklist?: string[]
}

export function createProjectToolHandlers(
  projectPath: string,
  commandTimeoutMs?: number,
  options?: ProjectToolOptions
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

  function resolveProjectFile(pathArg: string | undefined, fallback: string): string {
    const trimmed = pathArg?.trim()
    if (!trimmed) return fallback
    return resolve(projectPath, trimmed)
  }

  async function readPackageJson(
    pathArg: string | undefined
  ): Promise<{ path: string; data: any } | null> {
    const target = resolveProjectFile(pathArg, join(projectPath, 'package.json'))
    assertInsideProject(target, 'package.json')
    try {
      const raw = await readFile(target, 'utf-8')
      return { path: target, data: JSON.parse(raw) }
    } catch {
      return null
    }
  }

  async function readPackageLock(
    pathArg: string | undefined
  ): Promise<{ path: string; data: any } | null> {
    const fallback = join(projectPath, 'package-lock.json')
    const target = resolveProjectFile(pathArg, fallback)
    assertInsideProject(target, 'package-lock.json')
    try {
      const raw = await readFile(target, 'utf-8')
      return { path: target, data: JSON.parse(raw) }
    } catch {
      return null
    }
  }

  const handlers: Partial<ToolHandlers> = {
    search_knowledge_base: async (args) => {
      const { query, collection = 'knowledge_base' } = args
      const limit = Math.min(10, Math.max(1, parseInt(args.limit ?? '5', 10) || 5))

      if (!options?.qdrantUrl) {
        return 'Qdrant не настроен: укажи URL в настройках (поле "Qdrant URL")'
      }

      const ollamaUrl = options.ollamaUrl ?? 'http://127.0.0.1:11434'
      const embedding = await computeEmbedding(query, ollamaUrl)
      if (!embedding) {
        return 'Не удалось вычислить эмбеддинг запроса (проверь, запущен ли Ollama и модель nomic-embed-text)'
      }

      const client = new QdrantClient({
        url: options.qdrantUrl,
        ...(options.qdrantApiKey ? { apiKey: options.qdrantApiKey } : {})
      })

      let results: Awaited<ReturnType<typeof client.search>>
      try {
        results = await client.search(collection, {
          vector: embedding,
          limit,
          with_payload: true
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return `Ошибка поиска в Qdrant (коллекция "${collection}"): ${msg}`
      }

      if (!results.length) {
        return `Ничего не найдено в коллекции "${collection}" по запросу: ${query}`
      }

      return results
        .map((r, i) => {
          const p = r.payload as Record<string, unknown> | null | undefined
          const filePath = String(p?.file_path ?? p?.path ?? p?.source ?? '(неизвестен)')
          const text = String(p?.text ?? p?.content ?? p?.chunk ?? '')
          const score = r.score.toFixed(3)
          const preview = text.length > 600 ? `${text.slice(0, 600)}…` : text
          return `[${i + 1}] ${filePath}  (score: ${score})\n${preview}`
        })
        .join('\n\n---\n\n')
    },

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

    read_multiple_files: async (args) => {
      const results = await Promise.all(
        args.paths.map(async (path) => {
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
      const target = args.path?.trim() || projectPath
      const tree = await buildFileTree(target, 0, 5)
      const counts = countTree(tree as Array<{ isDirectory: boolean; children?: any[] }>)
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

    package_info: async (args) => {
      const pkg = await readPackageJson(args.path)
      if (!pkg) return 'package.json не найден или не удалось его прочитать.'

      const scripts = Object.entries(pkg.data.scripts ?? {})
        .slice(0, 20)
        .map(([name, cmd]) => `- ${name}: ${String(cmd)}`)
        .join('\n')
      const deps = Object.keys({
        ...(pkg.data.dependencies ?? {}),
        ...(pkg.data.devDependencies ?? {})
      })
      const depsText = deps.slice(0, 20).join(', ') || '(нет)'

      return [
        `Файл: ${pkg.path}`,
        `name: ${pkg.data.name ?? '(нет)'}`,
        `version: ${pkg.data.version ?? '(нет)'}`,
        `type: ${pkg.data.type ?? '(нет)'}`,
        '',
        'Scripts:',
        scripts || '(нет)',
        '',
        `Dependencies: ${depsText}`
      ].join('\n')
    },

    read_package_lock: async (args) => {
      const lock = await readPackageLock(args.path)
      if (!lock) return 'package-lock.json не найден или не удалось его прочитать.'
      const packages = lock.data.packages ? Object.keys(lock.data.packages) : []
      return [
        `Файл: ${lock.path}`,
        `lockfileVersion: ${lock.data.lockfileVersion ?? '(нет)'}`,
        `packages: ${packages.length}`,
        packages.length ? `Первый пакет: ${packages[0]}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    },

    dependency_summary: async (args) => {
      const pkg = await readPackageJson(args.path)
      if (!pkg) return 'package.json не найден или не удалось его прочитать.'
      const direct = Object.keys(pkg.data.dependencies ?? {})
      const dev = Object.keys(pkg.data.devDependencies ?? {})
      return [
        `Файл: ${pkg.path}`,
        `direct: ${direct.length}`,
        `dev: ${dev.length}`,
        `Основные direct: ${direct.slice(0, 12).join(', ') || '(нет)'}`,
        `Основные dev: ${dev.slice(0, 12).join(', ') || '(нет)'}`
      ].join('\n')
    },

    test_summary: async (args) => {
      const pkg = await readPackageJson(args.path)
      if (!pkg) return 'package.json не найден или не удалось его прочитать.'

      const scripts = pkg.data.scripts ?? {}
      const testScripts = Object.entries(scripts).filter(([name]) =>
        /test|check|lint|type/i.test(name)
      )
      const summary = testScripts
        .slice(0, 12)
        .map(([name, cmd]) => `- ${name}: ${String(cmd)}`)
        .join('\n')

      return [
        `Файл: ${pkg.path}`,
        'Тестовые команды:',
        summary || '- (не найдено)',
        '',
        'Подсказка: запускай наиболее точную команду из scripts, а не полный набор без нужды.'
      ].join('\n')
    },

    search_in_file: async (args) => {
      assertInsideProject(args.path, 'файл')
      const absPath = resolve(projectPath, args.path)
      const contextLines = Math.min(5, Math.max(0, parseInt(args.context_lines ?? '0', 10) || 0))
      const MAX_SEARCH_RESULTS = 100

      let content: string
      try {
        content = await readFile(absPath, 'utf-8')
      } catch {
        return `Ошибка чтения файла: ${args.path}`
      }
      if (content.includes('\0')) return `Файл бинарный, поиск невозможен: ${args.path}`

      const trimmed = args.query.trim()
      let matcher: (line: string) => boolean
      const slash = trimmed.match(/^\/(.+)\/([a-z]*)$/i)
      if (slash) {
        try {
          const re = new RegExp(slash[1], slash[2].includes('i') ? 'i' : undefined)
          matcher = (line) => re.test(line)
        } catch {
          matcher = (line) => line.toLowerCase().includes(trimmed.toLowerCase())
        }
      } else {
        const lower = trimmed.toLowerCase()
        matcher = (line) => line.toLowerCase().includes(lower)
      }

      const lines = content.split('\n')
      const results: string[] = []
      let count = 0
      let truncated = false

      for (let i = 0; i < lines.length; i++) {
        if (!matcher(lines[i])) continue
        if (count >= MAX_SEARCH_RESULTS) {
          truncated = true
          break
        }
        count++
        const start = Math.max(0, i - contextLines)
        const end = Math.min(lines.length - 1, i + contextLines)
        for (let j = start; j <= end; j++) {
          const marker = j === i ? '>' : ' '
          results.push(`${marker}${j + 1}: ${lines[j].trimEnd().slice(0, 300)}`)
        }
        if (contextLines > 0 && i + contextLines < lines.length - 1) results.push('---')
      }

      if (!results.length) return `Совпадений не найдено в ${args.path} (строк: ${lines.length}).`
      const header = `Найдено: ${count}${truncated ? '+' : ''} совпадений в ${args.path} (строк в файле: ${lines.length})\nЗапрос: ${args.query}`
      return `${header}\n\n${results.join('\n')}`
    },

    file_search_summary: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      const result = await grepInTreeWorker(projectPath, args.query, {
        subpath: args.path?.trim()
      })
      const topMatches = result.matches.slice(0, 8).map((m) => {
        const rel = m.path.startsWith(projectPath) ? m.path.slice(projectPath.length + 1) : m.path
        return `${rel}:${m.line}`
      })
      return [
        `Запрос: ${args.query}`,
        `Совпадений: ${result.matches.length}${result.truncated ? '+' : ''}`,
        `Файлов просмотрено: ${result.filesScanned}`,
        ...(result.skippedLargeFiles.length
          ? [`Пропущено больших файлов: ${result.skippedLargeFiles.length}`]
          : []),
        '',
        'Топ совпадения:',
        topMatches.length ? topMatches.join('\n') : '(нет)'
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
    },

    run_command: guardWrite(async (args) => {
      try {
        // Длительность команды неизвестна заранее — индикатор без процента.
        emitProgress(`Выполняю: ${args.command}`, null)
        const result = await runCommand(
          projectPath,
          args.command,
          commandTimeoutMs,
          options?.commandBlocklist
        )
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
      }),

    recent_changes: async (args) =>
      gitLog(projectPath, {
        limit: args.limit ?? '5',
        path: args.path,
        oneline: 'true'
      }),

    index_project: async (_args) => {
      const { qdrantUrl, qdrantApiKey, ollamaUrl } = options ?? {}
      if (!qdrantUrl) return 'Qdrant URL не настроен в настройках'
      if (!ollamaUrl) return 'Ollama URL не настроен в настройках'

      const COLLECTION = 'codeviper_project'
      const CHUNK_LINES = 500
      const TEXT_EXTS = new Set([
        '.ts',
        '.tsx',
        '.js',
        '.jsx',
        '.mjs',
        '.cjs',
        '.py',
        '.rb',
        '.go',
        '.rs',
        '.java',
        '.c',
        '.cpp',
        '.h',
        '.json',
        '.yaml',
        '.yml',
        '.toml',
        '.xml',
        '.md',
        '.txt',
        '.sh',
        '.bat',
        '.cmd',
        '.html',
        '.css',
        '.scss',
        '.less',
        '.vue',
        '.svelte',
        '.sql',
        '.graphql',
        '.gql'
      ])
      const SKIP_DIRS = new Set([
        'node_modules',
        '.git',
        'dist',
        'out',
        'release',
        'dist-electron',
        '.next',
        '__pycache__',
        '.venv',
        'venv',
        '.vitest-tmp'
      ])

      const client = new QdrantClient({
        url: qdrantUrl,
        ...(qdrantApiKey ? { apiKey: qdrantApiKey } : {})
      })

      try {
        const cols = await client.getCollections()
        const exists = cols.collections.some((c) => c.name === COLLECTION)
        if (!exists) {
          await client.createCollection(COLLECTION, {
            vectors: { size: 768, distance: 'Cosine' }
          })
        }
      } catch (e) {
        return `Ошибка подключения к Qdrant: ${e instanceof Error ? e.message : String(e)}`
      }

      const files: string[] = []
      async function walkDir(dir: string): Promise<void> {
        let entries
        try {
          entries = await readdir(dir, { withFileTypes: true })
        } catch {
          return
        }
        for (const entry of entries) {
          if (entry.name.startsWith('.') && entry.name !== '.codeviper') continue
          if (SKIP_DIRS.has(entry.name)) continue
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            await walkDir(full)
          } else if (entry.isFile() && TEXT_EXTS.has(extname(entry.name).toLowerCase())) {
            files.push(full)
          }
        }
      }

      emitProgress('Индексация: сканирование файлов...', 0)
      await walkDir(projectPath)

      let indexed = 0
      let errors = 0
      let totalChunks = 0

      for (let fi = 0; fi < files.length; fi++) {
        const absPath = files[fi]
        const relPath = relative(projectPath, absPath)
        emitProgress(`Индексация: ${relPath}`, Math.round((fi / files.length) * 100))

        let buf: Buffer
        try {
          buf = await readFile(absPath)
        } catch {
          errors++
          continue
        }
        if (buf.includes(0) || buf.length > FILE_SIZE_LIMIT_BYTES) continue

        const lines = buf.toString('utf-8').split('\n')
        const points: Array<{ id: string; vector: number[]; payload: Record<string, unknown> }> = []

        for (let ci = 0; ci * CHUNK_LINES < lines.length; ci++) {
          const chunkText = `File: ${relPath}\n\n${lines.slice(ci * CHUNK_LINES, (ci + 1) * CHUNK_LINES).join('\n')}`
          const vec = await computeEmbedding(chunkText, ollamaUrl)
          if (!vec) continue

          const hex = createHash('md5').update(`${relPath}:${ci}`).digest('hex')
          const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
          points.push({
            id,
            vector: vec,
            payload: { filePath: relPath, chunkIndex: ci, projectPath }
          })
          totalChunks++
        }

        if (points.length > 0) {
          try {
            await client.upsert(COLLECTION, { points, wait: false })
            indexed++
          } catch {
            errors++
          }
        }
      }

      clearProgress()
      return [
        'Индексация завершена:',
        `  Файлов обработано: ${indexed} из ${files.length}`,
        `  Чанков добавлено: ${totalChunks}`,
        `  Ошибок: ${errors}`,
        `  Коллекция: ${COLLECTION}`
      ].join('\n')
    }
  }

  return { handlers, clearEditSnapshots: () => editSnapshots.clear() }
}
