import { createHash } from 'crypto'
import { readFile, readdir } from 'fs/promises'
import { extname, join, relative, resolve } from 'path'
import { QdrantClient } from '@qdrant/js-client-rest'
import { computeEmbedding } from './embeddings'
import { FILE_SIZE_LIMIT_BYTES } from '../../shared/constants'
import type { ToolHandlers } from './agentTools'
import { AgentError } from '../../shared/agentError'
import { isInsideProject } from './services'
import { gitStatus, gitDiff, gitLog } from './gitTools'
import { emitProgress, clearProgress } from './progress'
import type { ProjectToolOptions } from './agentHandlersProjectContext'
import { createFileHandlers } from './agentHandlersProjectFile'
import { createSearchHandlers } from './agentHandlersProjectSearch'
import { createTerminalHandlers } from './agentHandlersProjectTerminal'

export type { ProjectToolOptions }

const READONLY_ERROR = 'Режим только чтение: операции записи заблокированы'

export function createProjectToolHandlers(
  projectPath: string,
  commandTimeoutMs?: number,
  options?: ProjectToolOptions
): { handlers: Partial<ToolHandlers>; clearEditSnapshots: () => void } {
  const editSnapshots = new Map<string, string>()

  function assertInsideProject(
    rawPath: string | undefined,
    label = 'путь',
    opts?: { allowEmpty?: boolean }
  ): void {
    const allowEmpty = opts?.allowEmpty ?? false
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

  const ctx = {
    projectPath,
    commandTimeoutMs,
    options,
    editSnapshots,
    assertInsideProject,
    guardWrite
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
    ...createFileHandlers(ctx),
    ...createSearchHandlers(ctx),
    ...createTerminalHandlers(ctx),

    search_knowledge_base: async (args: any) => {
      const { query } = args
      const collection = args.collection ?? 'codeviper_project'
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

    package_info: async (args: any) => {
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

    read_package_lock: async (args: any) => {
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

    dependency_summary: async (args: any) => {
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

    test_summary: async (args: any) => {
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

    git_status: async (args: any) => gitStatus(projectPath, args.path),

    git_diff: async (args: any) =>
      gitDiff(projectPath, {
        path: args.path,
        staged: args.staged,
        commit: args.commit
      }),

    git_log: async (args: any) =>
      gitLog(projectPath, {
        limit: args.limit,
        path: args.path,
        oneline: args.oneline
      }),

    recent_changes: async (args: any) =>
      gitLog(projectPath, {
        limit: args.limit ?? '5',
        path: args.path,
        oneline: 'true'
      }),

    index_project: async (_args: any) => {
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
