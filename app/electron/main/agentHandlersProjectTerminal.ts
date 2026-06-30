import { readFile, access, unlink, writeFile, readdir, stat } from 'fs/promises'
import { extname, join, resolve } from 'path'
import { tmpdir } from 'os'
import { runScriptInSandbox, isDockerAvailable } from './scriptSandbox'
import type { ToolHandlers } from './agentTools'
import { runCommand } from './services'
import { emitProgress, clearProgress } from './progress'
import { formatCommandResult } from './agentHandlersUtils'
import type { ProjectHandlerContext } from './agentHandlersProjectContext'
import {
  detectFormatProjectCommand,
  formatFormatProjectResult,
  type FormatFormatter
} from './formatProject'

function formatEslintOutput(filePath: string, stdout: string): string {
  const data = JSON.parse(stdout) as Array<{
    messages: Array<{
      ruleId: string | null
      severity: number
      message: string
      line: number
      column: number
    }>
    errorCount: number
    warningCount: number
  }>
  const messages = data.flatMap((f) => f.messages)
  if (!messages.length) return `Нарушений не найдено в ${filePath}`
  const errors = messages.filter((m) => m.severity === 2).length
  const warnings = messages.filter((m) => m.severity === 1).length
  const header = `ESLint: ${errors} ошибок, ${warnings} предупреждений в ${filePath}\n`
  return (
    header +
    messages
      .map((m, i) => {
        const level = m.severity === 2 ? 'error' : 'warning'
        const rule = m.ruleId ?? '(без правила)'
        return `[${i + 1}] L${m.line}:C${m.column}  ${rule} (${level})\n    ${m.message}`
      })
      .join('\n\n')
  )
}

function formatRuffOutput(filePath: string, stdout: string): string {
  const data = JSON.parse(stdout) as Array<{
    code: string
    message: string
    location: { row: number; column: number }
  }>
  if (!data.length) return `Нарушений не найдено в ${filePath}`
  const header = `Ruff: ${data.length} нарушений в ${filePath}\n`
  return (
    header +
    data
      .map(
        (v, i) => `[${i + 1}] L${v.location.row}:C${v.location.column}  ${v.code}\n    ${v.message}`
      )
      .join('\n\n')
  )
}

function formatHeavyDependenciesOutput(
  entries: Array<{ name: string; path: string; sizeBytes: number }>
): string {
  if (!entries.length) return 'Тяжёлых зависимостей > 1 MB не найдено.'
  return [
    `Найдено ${entries.length} пакетов > 1 MB:`,
    ...entries.map((entry, index) => {
      const sizeMb = (entry.sizeBytes / 1024 / 1024).toFixed(2)
      return `[${index + 1}] ${entry.name} — ${sizeMb} MB\n    ${entry.path}`
    })
  ].join('\n')
}

async function getDirectorySize(rootPath: string): Promise<number> {
  let total = 0
  const stack = [rootPath]
  while (stack.length > 0) {
    const current = stack.pop()!
    const entries = await readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const entryPath = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(entryPath)
      } else if (entry.isFile()) {
        total += (await stat(entryPath)).size
      }
    }
  }
  return total
}

async function findHeavyNodeModulesPackages(
  projectPath: string
): Promise<Array<{ name: string; path: string; sizeBytes: number }>> {
  const nodeModulesPath = join(projectPath, 'node_modules')
  const packages: Array<{ name: string; path: string; sizeBytes: number }> = []

  let nodeModulesEntries: Array<import('fs').Dirent>
  try {
    nodeModulesEntries = await readdir(nodeModulesPath, { withFileTypes: true })
  } catch {
    return packages
  }

  for (const entry of nodeModulesEntries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue

    const scopedPath = join(nodeModulesPath, entry.name)
    const scopedEntries = await readdir(scopedPath, { withFileTypes: true })
    const isScope = entry.name.startsWith('@')

    if (isScope) {
      for (const scopedEntry of scopedEntries) {
        if (!scopedEntry.isDirectory() || scopedEntry.name.startsWith('.')) continue
        const packagePath = join(scopedPath, scopedEntry.name)
        const sizeBytes = await getDirectorySize(packagePath)
        if (sizeBytes > 1024 * 1024) {
          packages.push({
            name: `${entry.name}/${scopedEntry.name}`,
            path: packagePath,
            sizeBytes
          })
        }
      }
      continue
    }

    const sizeBytes = await getDirectorySize(scopedPath)
    if (sizeBytes > 1024 * 1024) {
      packages.push({ name: entry.name, path: scopedPath, sizeBytes })
    }
  }

  return packages.sort((a, b) => b.sizeBytes - a.sizeBytes || a.name.localeCompare(b.name))
}

function formatLinterOutput(
  linter: 'eslint' | 'ruff',
  filePath: string,
  stdout: string,
  stderr: string,
  exitCode: number | null
): string {
  if (!stdout.trim()) {
    if (exitCode === 0) return `Нарушений не найдено в ${filePath}`
    return `Ошибка запуска ${linter}: ${stderr.trim() || 'нет вывода'}`
  }
  try {
    return linter === 'eslint'
      ? formatEslintOutput(filePath, stdout)
      : formatRuffOutput(filePath, stdout)
  } catch {
    return `${linter} вернул неожиданный формат:\n${stdout.slice(0, 2000)}`
  }
}

function parseTestOutput(
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number
): string {
  const combined = (stdout + '\n' + stderr).trim()
  const lines = combined.split('\n')

  let passed = 0
  let failed = 0
  let skipped = 0

  for (const line of lines) {
    const cargo = line.match(/(\d+) passed.*?(\d+) failed/)
    if (cargo) {
      passed = parseInt(cargo[1])
      failed = parseInt(cargo[2])
      continue
    }
    const pytest = line.match(/(\d+) failed.*?(\d+) passed/)
    if (pytest) {
      failed = parseInt(pytest[1])
      passed = parseInt(pytest[2])
      continue
    }
    const pytestPassed = line.match(/(\d+) passed/)
    if (pytestPassed && passed === 0) passed = parseInt(pytestPassed[1])
    const pytestFailed = line.match(/(\d+) failed/)
    if (pytestFailed && failed === 0) failed = parseInt(pytestFailed[1])
    const pytestSkipped = line.match(/(\d+) (?:skipped|pending)/)
    if (pytestSkipped && skipped === 0) skipped = parseInt(pytestSkipped[1])
    const jestLine = line.match(/(\d+)\s+passed/)
    if (jestLine && passed === 0) passed = parseInt(jestLine[1])
    const jestFail = line.match(/(\d+)\s+failed/)
    if (jestFail && failed === 0) failed = parseInt(jestFail[1])
  }

  const failedTests: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!
    if (
      /^●/.test(line) ||
      /^FAILED\s+\S+::\S+/.test(line) ||
      /\btest\b.*\.\.\. FAILED/.test(line) ||
      /^--- FAIL:/.test(line) ||
      /^\s*× /.test(line) ||
      /^\s*✕ /.test(line) ||
      /^\s*✗ /.test(line)
    ) {
      const name = line
        .replace(/^●\s*/, '')
        .replace(/^FAILED\s+/, '')
        .replace(/\s*\.\.\. FAILED.*$/, '')
        .replace(/^--- FAIL:\s*/, '')
        .replace(/\s+\(\d+\.\d+s\)$/, '')
        .replace(/^\s*[×✕✗]\s*/, '')
        .trim()
      if (name && !failedTests.includes(name)) failedTests.push(name)
    }
  }

  const status = exitCode === 0 ? '✅ Все тесты прошли' : '❌ Есть падения'
  const parts: string[] = []
  parts.push(`${status} (exit ${exitCode})`)
  parts.push(`Команда: ${command}`)

  if (passed > 0 || failed > 0 || skipped > 0) {
    const counters: string[] = []
    if (passed > 0) counters.push(`passed: ${passed}`)
    if (failed > 0) counters.push(`failed: ${failed}`)
    if (skipped > 0) counters.push(`skipped: ${skipped}`)
    parts.push(counters.join(' · '))
  }

  if (failedTests.length > 0) {
    parts.push(`\nУпавшие тесты (${failedTests.length}):`)
    for (const t of failedTests.slice(0, 20)) parts.push(`  • ${t}`)
    if (failedTests.length > 20) parts.push(`  … и ещё ${failedTests.length - 20}`)
  }

  if (lines.length > 0) {
    const rawPreview = lines.slice(0, 120).join('\n').trim()
    if (rawPreview) parts.push(`\n--- Вывод ---\n${rawPreview}`)
    if (lines.length > 120) parts.push(`[… ещё ${lines.length - 120} строк обрезано]`)
  }

  return parts.join('\n')
}

export function createTerminalHandlers(ctx: ProjectHandlerContext): Partial<ToolHandlers> {
  const { projectPath, commandTimeoutMs, options, assertInsideProject, guardWrite } = ctx

  return {
    run_command: guardWrite(async (args: any) => {
      try {
        emitProgress(`Выполняю: ${args.command}`, null)
        const result = await runCommand(
          projectPath,
          args.command,
          commandTimeoutMs,
          options?.commandBlocklist,
          undefined,
          options?.commandAllowlist
        )
        return formatCommandResult(result)
      } finally {
        clearProgress()
      }
    }),

    run_script: guardWrite(async (args: any) => {
      const scriptCwd = args.cwd ? resolve(projectPath, args.cwd) : projectPath
      if (args.cwd) assertInsideProject(args.cwd, 'рабочая папка')
      const interpreter: 'python' | 'bash' | 'powershell' =
        args.interpreter === 'python'
          ? 'python'
          : args.interpreter === 'powershell'
            ? 'powershell'
            : 'bash'

      if (options?.sandboxEnabled) {
        emitProgress(`Запуск ${interpreter} (sandbox)...`, null)
        try {
          const dockerOk = await isDockerAvailable()
          if (!dockerOk) {
            clearProgress()
            return '[Sandbox] Docker недоступен. Установи Docker Desktop и запусти его, или отключи опцию «Песочница» в настройках.'
          }
          const result = await runScriptInSandbox(
            args.script,
            interpreter,
            projectPath,
            commandTimeoutMs ?? 120_000
          )
          clearProgress()
          const lines: string[] = []
          if (result.stdout) lines.push(result.stdout.trimEnd())
          if (result.stderr) lines.push(`[stderr]\n${result.stderr.trimEnd()}`)
          if (result.exitCode !== 0) lines.push(`[exit ${result.exitCode}]`)
          return lines.join('\n') || '[пустой вывод]'
        } catch (err) {
          clearProgress()
          return `[Sandbox] Ошибка запуска Docker: ${err instanceof Error ? err.message : String(err)}`
        }
      }

      const ext = interpreter === 'python' ? '.py' : interpreter === 'powershell' ? '.ps1' : '.sh'
      const tmpPath = join(tmpdir(), `cv-script-${Date.now()}${ext}`)
      await writeFile(tmpPath, args.script, 'utf8')
      try {
        emitProgress(`Запуск ${interpreter}...`, null)
        let command: string
        if (interpreter === 'python') {
          command = process.platform === 'win32' ? `python "${tmpPath}"` : `python3 "${tmpPath}"`
        } else if (interpreter === 'powershell') {
          command =
            process.platform === 'win32'
              ? `powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpPath}"`
              : `pwsh -NoProfile -File "${tmpPath}"`
        } else {
          command = `bash "${tmpPath}"`
        }
        const result = await runCommand(
          scriptCwd,
          command,
          commandTimeoutMs,
          options?.commandBlocklist,
          undefined,
          options?.commandAllowlist
        )
        return formatCommandResult(result)
      } finally {
        clearProgress()
        await unlink(tmpPath).catch(() => {})
      }
    }),

    review_code: async (args: any) => {
      assertInsideProject(args.path, 'файл')
      const absPath = resolve(projectPath, args.path)
      const ext = extname(args.path).toLowerCase()
      let command: string
      let linter: 'eslint' | 'ruff'
      if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
        linter = 'eslint'
        command = `npx eslint --format json "${absPath}"`
      } else if (ext === '.py') {
        linter = 'ruff'
        command = `ruff check --output-format json "${absPath}"`
      } else {
        return `Неподдерживаемый тип файла: ${ext}. Поддерживаются .ts, .tsx, .js, .jsx, .py`
      }
      try {
        emitProgress(`Проверка кода: ${args.path}`, null)
        const result = await runCommand(
          projectPath,
          command,
          commandTimeoutMs,
          options?.commandBlocklist,
          undefined,
          options?.commandAllowlist
        )
        return formatLinterOutput(linter, args.path, result.stdout, result.stderr, result.exitCode)
      } finally {
        clearProgress()
      }
    },

    format_project: async (args: any) => {
      const fmtCwd = args.path ? resolve(projectPath, args.path) : projectPath
      if (args.path) assertInsideProject(args.path, 'папка')

      const formatter = (args.formatter ?? 'auto') as FormatFormatter
      const target = args.path ?? '.'
      const plan = await detectFormatProjectCommand(fmtCwd, formatter, target)
      if ('error' in plan) return plan.error

      try {
        emitProgress(`Форматирование (${plan.formatter})…`, null)
        const result = await runCommand(
          fmtCwd,
          plan.command,
          commandTimeoutMs,
          options?.commandBlocklist,
          undefined,
          options?.commandAllowlist
        )
        return formatFormatProjectResult(
          plan.formatter,
          plan.command,
          result.stdout,
          result.stderr,
          result.exitCode,
          plan.note
        )
      } finally {
        clearProgress()
      }
    },

    find_heavy_dependencies: async (args: any) => {
      const depsCwd = args.path ? resolve(projectPath, args.path) : projectPath
      if (args.path) assertInsideProject(args.path, 'папка')

      try {
        emitProgress('Анализ node_modules…', null)
        const packages = await findHeavyNodeModulesPackages(depsCwd)
        return formatHeavyDependenciesOutput(packages)
      } finally {
        clearProgress()
      }
    },

    run_tests: async (args: any) => {
      const testCwd = args.path ? resolve(projectPath, args.path) : projectPath
      if (args.path) assertInsideProject(args.path, 'папка тестов')

      let command: string
      if (args.command) {
        command = args.command
      } else {
        const exists = async (rel: string) => {
          try {
            await access(join(testCwd, rel))
            return true
          } catch {
            return false
          }
        }
        if (await exists('Cargo.toml')) {
          command = 'cargo test 2>&1'
        } else if (await exists('go.mod')) {
          command = 'go test ./... 2>&1'
        } else if (
          (await exists('pytest.ini')) ||
          (await exists('setup.py')) ||
          (await exists('pyproject.toml'))
        ) {
          command = 'python -m pytest --tb=short -q 2>&1'
        } else if (await exists('package.json')) {
          let pkg: { scripts?: Record<string, string> } = {}
          try {
            pkg = JSON.parse(await readFile(join(testCwd, 'package.json'), 'utf8')) as typeof pkg
          } catch {
            /* ignore */
          }
          const scripts = pkg.scripts ?? {}
          if (scripts.test?.includes('vitest')) {
            command = 'npx vitest run --reporter=verbose 2>&1'
          } else if (scripts.test?.includes('jest')) {
            command = 'npx jest --no-coverage 2>&1'
          } else if (scripts.test) {
            command = 'npm test -- --passWithNoTests 2>&1'
          } else {
            command = 'npx vitest run 2>&1'
          }
        } else {
          return 'Не удалось определить тест-раннер: нет package.json, Cargo.toml, go.mod, pytest.ini. Укажи команду через параметр command.'
        }
      }

      try {
        emitProgress('Запуск тестов…', null)
        const result = await runCommand(
          testCwd,
          command,
          commandTimeoutMs,
          options?.commandBlocklist,
          undefined,
          options?.commandAllowlist
        )
        return parseTestOutput(command, result.stdout, result.stderr, result.exitCode ?? 1)
      } finally {
        clearProgress()
      }
    }
  }
}
