#!/usr/bin/env node
/**
 * Семантическое версионирование CodeViper.
 *
 * Использование:
 *   npx tsx scripts/bump-version.ts patch   # 0.1.0 → 0.1.1
 *   npx tsx scripts/bump-version.ts minor   # 0.1.0 → 0.2.0
 *   npx tsx scripts/bump-version.ts major   # 0.1.0 → 1.0.0
 *
 * Что делает:
 *   1. Читает текущую версию из app/package.json
 *   2. Вычисляет новую версию
 *   3. Пишет новую версию обратно в package.json
 *   4. Собирает коммиты с последнего тега (или все, если тега нет)
 *   5. Добавляет запись в CHANGELOG.md
 *   6. git commit + git tag v<новая версия>
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// ── helpers ───────────────────────────────────────────────────────────────────

function run(cmd: string): string {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function bump(version: string, type: 'patch' | 'minor' | 'major'): string {
  const [major, minor, patch] = version.split('.').map(Number)
  if (type === 'major') return `${major + 1}.0.0`
  if (type === 'minor') return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
}

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getCommitsSinceLastTag(): string[] {
  const lastTag = run('git describe --tags --abbrev=0')
  const range = lastTag ? `${lastTag}..HEAD` : 'HEAD'
  const log = run(`git log ${range} --pretty=format:"%s" --no-merges`)
  return log ? log.split('\n').filter(Boolean) : []
}

function groupCommits(commits: string[]): string {
  const feat: string[] = []
  const fix: string[] = []
  const other: string[] = []

  for (const msg of commits) {
    if (/^feat[:(]/i.test(msg)) feat.push(msg)
    else if (/^fix[:(]/i.test(msg)) fix.push(msg)
    else other.push(msg)
  }

  const lines: string[] = []
  if (feat.length) {
    lines.push('### Новые возможности')
    feat.forEach((m) => lines.push(`- ${m}`))
  }
  if (fix.length) {
    lines.push('### Исправления')
    fix.forEach((m) => lines.push(`- ${m}`))
  }
  if (other.length) {
    lines.push('### Прочее')
    other.forEach((m) => lines.push(`- ${m}`))
  }
  return lines.join('\n')
}

// ── main ──────────────────────────────────────────────────────────────────────

const type = process.argv[2] as 'patch' | 'minor' | 'major' | undefined
if (!type || !['patch', 'minor', 'major'].includes(type)) {
  console.error('Использование: npx tsx scripts/bump-version.ts <patch|minor|major>')
  process.exit(1)
}

const root = join(import.meta.dirname ?? __dirname, '..')
const pkgPath = join(root, 'app', 'package.json')
const changelogPath = join(root, 'CHANGELOG.md')

// 1. Читаем текущую версию
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
const oldVersion: string = pkg.version
const newVersion = bump(oldVersion, type)

console.log(`Версия: ${oldVersion} → ${newVersion}`)

// 2. Обновляем package.json
pkg.version = newVersion
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf8')

// 3. Собираем коммиты
const commits = getCommitsSinceLastTag()
const body = commits.length > 0
  ? groupCommits(commits)
  : '_Нет изменений с предыдущей версии_'

// 4. Формируем запись для CHANGELOG
const entry = [
  `## [${newVersion}] — ${formatDate()}`,
  '',
  body,
  ''
].join('\n')

// 5. Пишем в CHANGELOG.md (новая запись сверху)
const existingChangelog = existsSync(changelogPath)
  ? readFileSync(changelogPath, 'utf8')
  : '# Changelog\n\nВсе значимые изменения в проекте.\n\n'

// Вставляем после заголовка (первой строки с "# ")
const headerEnd = existingChangelog.indexOf('\n\n') + 2
const newChangelog =
  existingChangelog.slice(0, headerEnd) +
  entry + '\n' +
  existingChangelog.slice(headerEnd)

writeFileSync(changelogPath, newChangelog, 'utf8')

// 6. git commit + tag
run(`git add app/package.json CHANGELOG.md`)
run(`git commit -m "chore: bump version to ${newVersion}"`)
run(`git tag v${newVersion}`)

console.log(`✓ Создан тег v${newVersion}`)
console.log(`✓ CHANGELOG.md обновлён`)
console.log(`Не забудьте: git push && git push --tags`)
