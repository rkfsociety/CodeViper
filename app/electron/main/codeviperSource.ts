import { app } from 'electron'
import { existsSync } from 'fs'
import { dirname, join, resolve, sep } from 'path'
import {
  isInsideProject,
  runCommand,
  safeAppendFile,
  safeCreateFile,
  safeDeleteFile,
  safeEditFile,
  safeMoveFile,
  safeReadFile,
  safeReadFilePartial,
  safeWriteFile
} from './services'

const BLOCKED_SELF_PARTS = new Set([
  'node_modules',
  'out',
  'dist-electron',
  'release',
  '.git',
  '.vitest-tmp'
])

let sourceRootOverride: string | null = null

function hasSourceMarkers(root: string): boolean {
  return (
    existsSync(join(root, 'package.json')) && existsSync(join(root, 'electron', 'main', 'agent.ts'))
  )
}

export function setSourceRootOverride(path: string | null): void {
  sourceRootOverride = path
}

export function getCodeViperSourceRoot(): string {
  if (sourceRootOverride && hasSourceMarkers(sourceRootOverride)) {
    return resolve(sourceRootOverride)
  }

  let appPath: string | null = null
  try {
    appPath = app.getAppPath()
  } catch {
    /* тесты — app не инициализирован */
  }

  const candidates = [
    join(process.cwd(), 'app'),
    process.cwd(),
    ...(appPath ? [join(appPath)] : []),
    join(__dirname, '../..')
  ]

  for (const root of candidates) {
    if (hasSourceMarkers(root)) return resolve(root)
  }

  return resolve(join(__dirname, '../..'))
}

/** Убирает лишний префикс app/, если корень исходников уже .../app */
export function normalizeCodeViperPath(sourceRoot: string, filePath: string): string {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('Не указан path — путь к файлу в исходниках CodeViper')
  }
  const rel = filePath.trim().replace(/\\/g, '/')
  if (!rel) return rel

  const rootName = sourceRoot.split(/[/\\]/).filter(Boolean).pop()?.toLowerCase()
  if (rootName !== 'app') return filePath.trim()

  const stripped = rel.replace(/^\.\//, '')
  if (stripped === 'app') return '.'
  if (stripped.startsWith('app/')) return stripped.slice(4)

  return filePath.trim()
}

export function isAllowedSelfPath(sourceRoot: string, targetPath: string): boolean {
  const normalized = normalizeCodeViperPath(sourceRoot, targetPath)
  const absolute = resolve(sourceRoot, normalized)
  const baseName = absolute.split(sep).pop()?.toLowerCase()
  const parentRoot = resolve(sourceRoot, '..')
  if (
    (baseName === 'roadmap.md' || baseName === 'roadmap_done.md' || baseName === 'readme.md') &&
    isInsideProject(parentRoot, absolute)
  ) {
    return true
  }

  if (!isInsideProject(sourceRoot, absolute)) return false

  const relative = absolute
    .slice(resolve(sourceRoot).length)
    .replace(/^[/\\]+/, '')
    .split(sep)
    .filter(Boolean)

  return !relative.some((part) => BLOCKED_SELF_PARTS.has(part))
}

function codeViperReadRoot(sourceRoot: string, filePath: string): { root: string; rel: string } {
  const normalized = normalizeCodeViperPath(sourceRoot, filePath)
  const absPath = resolve(sourceRoot, normalized)
  const baseName = absPath.split(sep).pop()?.toLowerCase()
  const parentRoot = resolve(sourceRoot, '..')
  if (
    (baseName === 'roadmap.md' || baseName === 'roadmap_done.md' || baseName === 'readme.md') &&
    isInsideProject(parentRoot, absPath)
  ) {
    return { root: parentRoot, rel: baseName! }
  }
  return { root: sourceRoot, rel: normalized }
}

export async function readCodeViperFile(filePath: string): Promise<string> {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  const { root: readRoot, rel } = codeViperReadRoot(root, filePath)
  return safeReadFile(readRoot, rel)
}

export async function readCodeViperFilePartial(
  filePath: string,
  offset: number,
  limit?: number
): Promise<string> {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  const { root: readRoot, rel } = codeViperReadRoot(root, filePath)
  return safeReadFilePartial(readRoot, rel, offset, limit)
}

export async function writeCodeViperFile(filePath: string, content: string): Promise<void> {
  const { root, rel } = assertCodeViperPath(filePath)
  await safeWriteFile(root, rel, content)
}

function assertCodeViperPath(filePath: string): { root: string; rel: string } {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  return codeViperReadRoot(root, filePath)
}

export async function createCodeViperFile(filePath: string, content: string): Promise<void> {
  const { root, rel } = assertCodeViperPath(filePath)
  await safeCreateFile(root, rel, content)
}

export async function editCodeViperFile(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false
): Promise<number> {
  const { root, rel } = assertCodeViperPath(filePath)
  return safeEditFile(root, rel, oldString, newString, replaceAll)
}

export async function appendCodeViperFile(filePath: string, content: string): Promise<void> {
  const { root, rel } = assertCodeViperPath(filePath)
  await safeAppendFile(root, rel, content)
}

export async function deleteCodeViperFile(filePath: string): Promise<void> {
  const { root, rel } = assertCodeViperPath(filePath)
  await safeDeleteFile(root, rel)
}

export async function moveCodeViperFile(fromPath: string, toPath: string): Promise<void> {
  const { root, rel: fromRel } = assertCodeViperPath(fromPath)
  const toRel = normalizeCodeViperPath(root, toPath)
  if (!isAllowedSelfPath(root, toRel)) {
    throw new Error(
      'Доступ запрещён: целевой путь вне исходников CodeViper или в исключённой папке'
    )
  }
  await safeMoveFile(root, fromRel, toRel)
}

function bundledNodeBinaryName(): string {
  return process.platform === 'win32' ? 'node.exe' : join('bin', 'node')
}

export function getBundledNodeBin(): string | null {
  const appPath = app.getAppPath()
  const binaryName = bundledNodeBinaryName()
  const candidates = [
    join(appPath, 'resources', 'node', binaryName),
    join(dirname(appPath), 'node', binaryName),
    ...(process.resourcesPath ? [join(process.resourcesPath, 'node', binaryName)] : [])
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  return null
}

function prependBundledNodeToPath(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const bundledBin = getBundledNodeBin()
  if (!bundledBin) return env

  const nodeDir = dirname(bundledBin)
  const pathSep = process.platform === 'win32' ? ';' : ':'
  const currentPath = env.PATH ?? env.Path ?? ''
  const nextPath = currentPath ? `${nodeDir}${pathSep}${currentPath}` : nodeDir

  return {
    ...env,
    PATH: nextPath,
    ...(process.platform === 'win32' ? { Path: nextPath } : {})
  }
}

/** Команда в указанном корне app/ (portable Node в PATH). */
export async function runCommandInAppRoot(appRoot: string, command: string, timeoutMs?: number) {
  return runCommand(appRoot, command, timeoutMs, undefined, prependBundledNodeToPath(process.env))
}

export async function runCodeViperCommand(command: string) {
  const root = getCodeViperSourceRoot()
  return runCommandInAppRoot(root, command)
}

export function buildSelfEditContext(isPackaged = false): string {
  const root = getCodeViperSourceRoot()
  const buildCmd = !isPackaged ? ', npm run build' : ''
  const buildStep = !isPackaged ? ' && npm run build' : ''
  return `# Исходники CodeViper (саморедактирование)
Корень app/: ${root}
Репозиторий (ROADMAP.md, ROADMAP_DONE.md, README.md): ${join(root, '..')}

**Не путать с папкой установки** (Program Files, рядом с CodeViper.exe) — для правок только пути выше и инструменты \`*_codeviper_*\`.

Инструменты для правки **своего** кода (работают независимо от проекта в чате):
- list_codeviper_directory — структура исходников
- read_codeviper_file / write_codeviper_file — чтение и полная перезапись
- create_codeviper_file — новый файл (ошибка, если уже есть)
- edit_codeviper_file — точечная замена old_string → new_string
- append_codeviper_file — дописать в конец существующего файла
- run_codeviper_command — команды в корне app/ (npm run typecheck, npm test${buildCmd})
- create_codeviper_branch <name> — создать ветку agent/<name> вместо коммита в master
- push_codeviper_branch — запушить ветку agent/... на GitHub
- create_codeviper_pr — создать Pull Request из ветки agent/* (gh pr create); PR не mержится автоматически

Навыки (instructions без пересборки): create_skill / update_skill — всегда глобальные, %APPDATA%/CodeViper/ViperSkills.md.

**Тесты** (\`tests/*.test.ts\`): \`../electron/main/...\`, \`../shared/...\`, \`../src/types\` — не \`./modelRuntime\`.

Типичный workflow «улучши себя»:
1. list_codeviper_directory + read_codeviper_file — изучить agent.ts, skills.ts, shared/
2. create_codeviper_branch fix-<тема> — создать ветку для изменений
3. create_skill — если достаточно инструкции; иначе write_codeviper_file — правка кода
4. run_codeviper_command: npm run typecheck && npm test${buildStep}
5. commit_and_push_self_edits — закоммитить изменения
6. create_codeviper_pr — открыть PR на ревью (ветка пушится автоматически; PR не mержится сам)
7. Кратко сообщить, что изменено; для main process нужен перезапуск приложения`
}
