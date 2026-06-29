import { access, readFile } from 'fs/promises'
import { join } from 'path'

export type FormatFormatter = 'auto' | 'prettier' | 'black'

export type FormatProjectPlan = {
  command: string
  formatter: 'prettier' | 'black' | 'npm-format'
  note?: string
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

function quoteTarget(target: string): string {
  return target === '.' ? '.' : `"${target.replace(/"/g, '')}"`
}

export async function detectFormatProjectCommand(
  cwd: string,
  formatter: FormatFormatter = 'auto',
  target = '.'
): Promise<FormatProjectPlan | { error: string }> {
  const rel = target.trim() || '.'
  const quoted = quoteTarget(rel)

  if (formatter === 'prettier') {
    return { command: `npx prettier --write ${quoted}`, formatter: 'prettier' }
  }
  if (formatter === 'black') {
    return { command: `black ${quoted}`, formatter: 'black' }
  }

  if (await pathExists(join(cwd, 'package.json'))) {
    try {
      const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
        devDependencies?: Record<string, string>
        dependencies?: Record<string, string>
      }
      if (pkg.scripts?.format) {
        return {
          command: rel === '.' ? 'npm run format' : `npm run format -- ${quoted}`,
          formatter: 'npm-format',
          note: 'скрипт format из package.json'
        }
      }
      const hasPrettier =
        Boolean(pkg.devDependencies?.prettier || pkg.dependencies?.prettier) ||
        (await pathExists(join(cwd, '.prettierrc'))) ||
        (await pathExists(join(cwd, '.prettierrc.json'))) ||
        (await pathExists(join(cwd, 'prettier.config.js'))) ||
        (await pathExists(join(cwd, 'prettier.config.mjs')))
      if (hasPrettier || rel !== '.') {
        return {
          command: `npx prettier --write ${quoted}`,
          formatter: 'prettier',
          note: hasPrettier ? undefined : 'package.json без prettier — попытка npx prettier'
        }
      }
      return {
        command: 'npx prettier --write .',
        formatter: 'prettier',
        note: 'package.json найден — prettier по умолчанию'
      }
    } catch {
      return { command: `npx prettier --write ${quoted}`, formatter: 'prettier' }
    }
  }

  const pyMarkers = ['pyproject.toml', 'setup.py', 'setup.cfg', 'requirements.txt']
  for (const marker of pyMarkers) {
    if (await pathExists(join(cwd, marker))) {
      return {
        command: `black ${quoted}`,
        formatter: 'black',
        note: `Python-проект (${marker})`
      }
    }
  }

  return {
    error:
      'Не удалось определить форматтер: нет package.json и Python-маркеров. Укажи formatter=prettier или formatter=black.'
  }
}

export function formatFormatProjectResult(
  formatter: string,
  command: string,
  stdout: string,
  stderr: string,
  exitCode: number | null | undefined,
  note?: string
): string {
  const out = (stdout + (stderr ? '\n' + stderr : '')).trim()
  if (exitCode === 0) {
    const header = note
      ? `Форматирование прошло (${formatter}, ${note}).`
      : `Форматирование прошло (${formatter}).`
    return out ? `${header}\n\n${out}` : header
  }
  return `Ошибка форматирования (${formatter}, код ${exitCode ?? '?'}).\nКоманда: ${command}\n\n${out || '(нет вывода)'}`
}
