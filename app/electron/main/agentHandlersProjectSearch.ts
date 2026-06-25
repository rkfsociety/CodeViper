import { readFile } from 'fs/promises'
import { resolve } from 'path'
import type { ToolHandlers } from './agentTools'
import { formatGrepResults, formatFindResults, MAX_WALK_FILES } from './fileSearch'
import { findSymbolDeclarations, findSymbolReferences, formatSymbolResults } from './symbolIndex'
import { grepInTreeWorker, findFilesInTreeWorker } from './fileSearchInWorker'
import { emitProgress, clearProgress } from './progress'
import type { ProjectHandlerContext } from './agentHandlersProjectContext'

function scanPercent(scanned: number): number {
  return Math.min(99, Math.round((scanned / MAX_WALK_FILES) * 100))
}

export function createSearchHandlers(ctx: ProjectHandlerContext): Partial<ToolHandlers> {
  const { projectPath, assertInsideProject } = ctx

  return {
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

    find_symbol: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск символа: ${args.name}`, 0)
        const result = await findSymbolDeclarations(projectPath, args.name, {
          subpath: args.path?.trim(),
          onProgress: (scanned) => emitProgress(`Поиск символа: ${args.name}`, scanPercent(scanned))
        })
        return formatSymbolResults(projectPath, args.name, result, 'declaration')
      } finally {
        clearProgress()
      }
    },

    find_references: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск ссылок: ${args.name}`, 0)
        const result = await findSymbolReferences(projectPath, args.name, {
          subpath: args.path?.trim(),
          onProgress: (scanned) => emitProgress(`Поиск ссылок: ${args.name}`, scanPercent(scanned))
        })
        return formatSymbolResults(projectPath, args.name, result, 'reference')
      } finally {
        clearProgress()
      }
    },

    search_in_project: async (args) => {
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        if (args.type === 'name') {
          emitProgress(`Поиск файлов: ${args.query}`, 0)
          const result = await findFilesInTreeWorker(projectPath, args.query, {
            subpath: args.path?.trim(),
            onProgress: (scanned) =>
              emitProgress(`Поиск файлов: ${args.query}`, scanPercent(scanned))
          })
          return formatFindResults(projectPath, args.query, result)
        } else {
          emitProgress(`Поиск по коду: ${args.query}`, 0)
          const result = await grepInTreeWorker(projectPath, args.query, {
            subpath: args.path?.trim(),
            onProgress: (scanned) =>
              emitProgress(`Поиск по коду: ${args.query}`, scanPercent(scanned))
          })
          return formatGrepResults(projectPath, args.query, result)
        }
      } finally {
        clearProgress()
      }
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
    }
  }
}
