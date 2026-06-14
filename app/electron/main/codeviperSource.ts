import { app } from 'electron'
import { existsSync } from 'fs'
import { join, resolve, sep } from 'path'
import {
  isInsideProject,
  runCommand,
  safeReadFile,
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
    existsSync(join(root, 'package.json')) &&
    existsSync(join(root, 'electron', 'main', 'agent.ts'))
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

export async function writeCodeViperFile(filePath: string, content: string): Promise<void> {
  const root = getCodeViperSourceRoot()
  if (!isAllowedSelfPath(root, filePath)) {
    throw new Error('Доступ запрещён: путь вне исходников CodeViper или в исключённой папке')
  }
  await safeWriteFile(root, filePath, content)
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
- read_codeviper_file / write_codeviper_file — чтение и запись файлов приложения
- run_codeviper_command — команды в корне app/ (npm test, npm run typecheck, npm run build)

Навыки (instructions без пересборки): create_skill / update_skill (scope global — для всего агента).

Типичный workflow «улучши себя»:
1. list_codeviper_directory + read_codeviper_file — изучить agent.ts, skills.ts, shared/
2. create_skill — если достаточно инструкции; иначе write_codeviper_file — правка кода
3. run_codeviper_command: npm run typecheck && npm test
4. Кратко сообщить, что изменено; для main process нужен перезапуск приложения`
}
