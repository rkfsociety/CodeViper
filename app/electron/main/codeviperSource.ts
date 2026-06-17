import { app } from 'electron'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
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

function hasSourceMarkers(root: string): boolean {
  return (
    existsSync(join(root, 'package.json')) && existsSync(join(root, 'electron', 'main', 'agent.ts'))
  )
}

export function getCodeViperSourceRoot(): string {
  const candidates = [
    join(process.cwd(), 'app'),
    process.cwd(),
    join(app.getAppPath()),
    join(__dirname, '../..')
  ]

  for (const root of candidates) {
    if (hasSourceMarkers(root)) return resolve(root)
  }

  return resolve(join(__dirname, '../..'))
}

export function isAllowedSelfPath(sourceRoot: string, targetPath: string): boolean {
  if (!isInsideProject(sourceRoot, targetPath)) return false

  const relative = resolve(targetPath)
    .slice(resolve(sourceRoot).length)
    .replace(/^[/\\]+/, '')
    .split(sep)
    .filter(Boolean)

  return !relative.some((part) => BLOCKED_SELF_PARTS.has(part))
}

export async function readCodeViperFile(filePath: string): Promise<string> {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  return safeReadFile(root, filePath)
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
  return safeReadFilePartial(root, filePath, offset, limit)
}

export async function writeCodeViperFile(filePath: string, content: string): Promise<void> {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  await safeWriteFile(root, filePath, content)
}

function assertCodeViperPath(filePath: string): string {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  return root
}

export async function createCodeViperFile(filePath: string, content: string): Promise<void> {
  const root = assertCodeViperPath(filePath)
  await safeCreateFile(root, filePath, content)
}

export async function editCodeViperFile(
  filePath: string,
  oldString: string,
  newString: string,
  replaceAll = false
): Promise<number> {
  const root = assertCodeViperPath(filePath)
  return safeEditFile(root, filePath, oldString, newString, replaceAll)
}

export async function appendCodeViperFile(filePath: string, content: string): Promise<void> {
  const root = assertCodeViperPath(filePath)
  await safeAppendFile(root, filePath, content)
}

export async function deleteCodeViperFile(filePath: string): Promise<void> {
  const root = assertCodeViperPath(filePath)
  await safeDeleteFile(root, filePath)
}

export async function moveCodeViperFile(fromPath: string, toPath: string): Promise<void> {
  const root = assertCodeViperPath(fromPath)
  if (!isAllowedSelfPath(root, toPath)) {
    throw new Error(
      'Доступ запрещён: целевой путь вне исходников CodeViper или в исключённой папке'
    )
  }
  await safeMoveFile(root, fromPath, toPath)
}

export async function runCodeViperCommand(command: string) {
  const root = getCodeViperSourceRoot()
  return runCommand(root, command)
}

export function buildSelfEditContext(): string {
  const root = getCodeViperSourceRoot()
  return `# Исходники CodeViper (саморедактирование)
Корень: ${root}

Инструменты для правки **своего** кода (работают независимо от проекта в чате):
- list_codeviper_directory — структура исходников
- read_codeviper_file / write_codeviper_file — чтение и полная перезапись
- create_codeviper_file — новый файл (ошибка, если уже есть)
- edit_codeviper_file — точечная замена old_string → new_string
- append_codeviper_file — дописать в конец существующего файла
- run_codeviper_command — команды в корне app/ (npm test, npm run typecheck, npm run build)

Навыки (instructions без пересборки): create_skill / update_skill — всегда глобальные, %APPDATA%/CodeViper/ViperSkills.md.

Типичный workflow «улучши себя»:
1. list_codeviper_directory + read_codeviper_file — изучить agent.ts, skills.ts, shared/
2. create_skill — если достаточно инструкции; иначе write_codeviper_file — правка кода
3. run_codeviper_command: npm run typecheck && npm test
4. Кратко сообщить, что изменено; для main process нужен перезапуск приложения`
}
