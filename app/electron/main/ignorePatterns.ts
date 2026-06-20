import { readFile } from 'fs/promises'
import { join } from 'path'
import * as minimatch from 'minimatch'

interface IgnoreRules {
  patterns: string[]
  matchers: minimatch.Minimatch[]
}

const ignoreRulesCache = new Map<string, IgnoreRules>()

async function loadIgnoreFile(dirPath: string, filename: string): Promise<string[]> {
  try {
    const filePath = join(dirPath, filename)
    const content = await readFile(filePath, 'utf-8')
    return content
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
  } catch {
    return []
  }
}

export async function loadIgnorePatterns(dirPath: string): Promise<IgnoreRules> {
  const cacheKey = dirPath
  if (ignoreRulesCache.has(cacheKey)) {
    return ignoreRulesCache.get(cacheKey)!
  }

  // Читаем все .ignore-файлы в порядке приоритета
  const patterns: string[] = []

  // .gitignore — основной источник
  patterns.push(...(await loadIgnoreFile(dirPath, '.gitignore')))

  // .claudeignore — специфично для Claude Code
  patterns.push(...(await loadIgnoreFile(dirPath, '.claudeignore')))

  // .cursorignore — специфично для Cursor IDE
  patterns.push(...(await loadIgnoreFile(dirPath, '.cursorignore')))

  // Де-дупликация
  const uniquePatterns = [...new Set(patterns)]

  // Компилируем в minimatch для быстрого сравнения
  const matchers = uniquePatterns.map(
    (pattern) =>
      new minimatch.Minimatch(pattern, {
        dot: true,
        noglobstar: false
      })
  )

  const rules = { patterns: uniquePatterns, matchers }
  ignoreRulesCache.set(cacheKey, rules)

  return rules
}

export function shouldIgnorePath(name: string, rules: IgnoreRules): boolean {
  return rules.matchers.some((matcher) => matcher.match(name))
}

export function clearIgnorePatternsCache(dirPath?: string): void {
  if (dirPath) {
    for (const key of ignoreRulesCache.keys()) {
      if (key === dirPath || key.startsWith(dirPath)) {
        ignoreRulesCache.delete(key)
      }
    }
  } else {
    ignoreRulesCache.clear()
  }
}
