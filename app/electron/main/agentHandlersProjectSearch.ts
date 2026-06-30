import { readFile } from 'fs/promises'
import { resolve } from 'path'
import type { ToolHandlers } from './agentTools'
import { formatGrepResults, formatFindResults, MAX_WALK_FILES } from './fileSearch'
import {
  findSymbolDeclarations,
  findSymbolReferences,
  formatSymbolResults,
  buildDependencyDiagram,
  formatDependencyDiagram,
  buildClassDiagram,
  formatClassDiagram,
  buildDataflowDiagram,
  formatDataflowDiagram
} from './symbolIndex'
import { findDeadCode, formatDeadCodeReport } from './deadCodeIndex'
import { findSlowCode, formatSlowCodeReport } from './slowCodeIndex'
import { findTypeMismatches, formatTypeMismatchReport } from './typeMismatchIndex'
import { findHotkeyConflicts, formatHotkeyConflictReport } from './hotkeyConflictIndex'
import { buildProjectMetrics, formatProjectMetrics } from './projectMetricsIndex'
import { grepInTreeWorker, findFilesInTreeWorker } from './fileSearchInWorker'
import { emitProgress, clearProgress } from './progress'
import type { ProjectHandlerContext } from './agentHandlersProjectContext'
import { missingToolArg, resolveToolPathArg } from './agentHandlersUtils'

function scanPercent(scanned: number): number {
  return Math.min(99, Math.round((scanned / MAX_WALK_FILES) * 100))
}

export function createSearchHandlers(ctx: ProjectHandlerContext): Partial<ToolHandlers> {
  const { projectPath, assertInsideProject } = ctx

  return {
    grep_files: async (args) => {
      const query = args.query?.trim()
      if (!query) return missingToolArg('query (текст или /regex/i для поиска)')
      const pathArg = resolveToolPathArg(args as Record<string, unknown>)
      assertInsideProject(pathArg, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск по коду: ${query}`, 0)
        const result = await grepInTreeWorker(projectPath, query, {
          subpath: pathArg,
          onProgress: (scanned) => emitProgress(`Поиск по коду: ${query}`, scanPercent(scanned))
        })
        return formatGrepResults(projectPath, query, result)
      } finally {
        clearProgress()
      }
    },

    find_files: async (args) => {
      const pattern = args.pattern?.trim()
      if (!pattern) return missingToolArg('pattern (имя или glob, напр. *.ts)')
      const pathArg = resolveToolPathArg(args as Record<string, unknown>)
      assertInsideProject(pathArg, 'папка для поиска', { allowEmpty: true })
      try {
        emitProgress(`Поиск файлов: ${pattern}`, 0)
        const result = await findFilesInTreeWorker(projectPath, pattern, {
          subpath: pathArg,
          onProgress: (scanned) => emitProgress(`Поиск файлов: ${pattern}`, scanPercent(scanned))
        })
        return formatFindResults(projectPath, pattern, result)
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

    find_slow_code: async (args) => {
      assertInsideProject(args.path, 'папка или файл для анализа', { allowEmpty: true })
      try {
        emitProgress('AST-анализ медленного кода', 0)
        const result = await findSlowCode(projectPath, {
          subpath: args.path?.trim(),
          onProgress: (scanned) => emitProgress('AST-анализ медленного кода', scanPercent(scanned))
        })
        return formatSlowCodeReport(projectPath, result)
      } finally {
        clearProgress()
      }
    },

    find_dead_code: async (args) => {
      assertInsideProject(args.path, 'папка или файл для анализа', { allowEmpty: true })
      try {
        emitProgress('AST-анализ мёртвого кода', 0)
        const result = await findDeadCode(projectPath, {
          subpath: args.path?.trim(),
          onProgress: (scanned) => emitProgress('AST-анализ мёртвого кода', scanPercent(scanned))
        })
        return formatDeadCodeReport(projectPath, result)
      } finally {
        clearProgress()
      }
    },

    find_type_mismatches: async (args) => {
      assertInsideProject(args.path, 'РїР°РїРєР° РёР»Рё С„Р°Р№Р» РґР»СЏ Р°РЅР°Р»РёР·Р°', {
        allowEmpty: true
      })
      try {
        emitProgress('TS-typecheck Р°РЅР°Р»РёР· РЅРµСЃРѕРѕС‚РІРµС‚СЃС‚РІРёР№', 0)
        const result = await findTypeMismatches(projectPath, {
          subpath: args.path?.trim()
        })
        return formatTypeMismatchReport(projectPath, result)
      } finally {
        clearProgress()
      }
    },

    find_hotkey_conflicts: async (args) => {
      assertInsideProject(args.path, 'папка или файл для анализа', { allowEmpty: true })
      try {
        emitProgress('Поиск конфликтов hotkey', 0)
        const result = await findHotkeyConflicts(projectPath, {
          path: args.path?.trim()
        })
        return formatHotkeyConflictReport(result)
      } finally {
        clearProgress()
      }
    },

    generate_dependency_diagram: async (args) => {
      assertInsideProject(args.path, 'папка для анализа', { allowEmpty: true })
      if (args.focus?.trim()) assertInsideProject(args.focus, 'файл фокуса')
      try {
        emitProgress('Построение графа зависимостей', 0)
        const result = await buildDependencyDiagram(projectPath, {
          subpath: args.path?.trim(),
          focus: args.focus?.trim(),
          onProgress: (scanned) =>
            emitProgress('Построение графа зависимостей', scanPercent(scanned))
        })
        return formatDependencyDiagram(result)
      } finally {
        clearProgress()
      }
    },

    generate_class_diagram: async (args) => {
      assertInsideProject(args.path, 'папка для анализа', { allowEmpty: true })
      try {
        emitProgress('Построение диаграммы классов', 0)
        const result = await buildClassDiagram(projectPath, {
          subpath: args.path?.trim(),
          onProgress: (scanned) =>
            emitProgress('Построение диаграммы классов', scanPercent(scanned))
        })
        return formatClassDiagram(result)
      } finally {
        clearProgress()
      }
    },

    generate_dataflow_diagram: async (args) => {
      assertInsideProject(args.path, 'папка для анализа', { allowEmpty: true })
      if (args.focus?.trim()) assertInsideProject(args.focus, 'файл фокуса')
      try {
        emitProgress('Построение DFD потоков данных', 0)
        const result = await buildDataflowDiagram(projectPath, {
          subpath: args.path?.trim(),
          focus: args.focus?.trim(),
          onProgress: (scanned) =>
            emitProgress('Построение DFD потоков данных', scanPercent(scanned))
        })
        return formatDataflowDiagram(result)
      } finally {
        clearProgress()
      }
    },

    generate_project_metrics: async (args) => {
      assertInsideProject(args.path, 'папка для анализа', { allowEmpty: true })
      try {
        emitProgress('Агрегация метрик проекта', 0)
        const result = await buildProjectMetrics(projectPath, {
          subpath: args.path?.trim(),
          onProgress: (scanned) => emitProgress('Агрегация метрик проекта', scanPercent(scanned))
        })
        return formatProjectMetrics(projectPath, result)
      } finally {
        clearProgress()
      }
    },

    search_in_project: async (args) => {
      const query = args.query?.trim()
      if (!query) return missingToolArg('query')
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      try {
        if (args.type === 'name') {
          emitProgress(`Поиск файлов: ${query}`, 0)
          const result = await findFilesInTreeWorker(projectPath, query, {
            subpath: args.path?.trim(),
            onProgress: (scanned) => emitProgress(`Поиск файлов: ${query}`, scanPercent(scanned))
          })
          return formatFindResults(projectPath, query, result)
        } else {
          emitProgress(`Поиск по коду: ${query}`, 0)
          const result = await grepInTreeWorker(projectPath, query, {
            subpath: args.path?.trim(),
            onProgress: (scanned) => emitProgress(`Поиск по коду: ${query}`, scanPercent(scanned))
          })
          return formatGrepResults(projectPath, query, result)
        }
      } finally {
        clearProgress()
      }
    },

    search_in_file: async (args) => {
      assertInsideProject(args.path, 'файл')
      const query = args.query?.trim()
      if (!query) return missingToolArg('query (текст или /regex/i для поиска)')
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

      const trimmed = query
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
      const header = `Найдено: ${count}${truncated ? '+' : ''} совпадений в ${args.path} (строк в файле: ${lines.length})\nЗапрос: ${query}`
      return `${header}\n\n${results.join('\n')}`
    },

    file_search_summary: async (args) => {
      const query = args.query?.trim()
      if (!query) return missingToolArg('query (текст или /regex/i для поиска)')
      assertInsideProject(args.path, 'папка для поиска', { allowEmpty: true })
      const result = await grepInTreeWorker(projectPath, query, {
        subpath: args.path?.trim()
      })
      const topMatches = result.matches.slice(0, 8).map((m) => {
        const rel = m.path.startsWith(projectPath) ? m.path.slice(projectPath.length + 1) : m.path
        return `${rel}:${m.line}`
      })
      return [
        `Запрос: ${query}`,
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
