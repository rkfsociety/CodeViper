#!/usr/bin/env node
/**
 * Красивые release notes из git log между тегами.
 *
 * Usage:
 *   node scripts/generate-release-notes.mjs --tag v0.3.6 [--prev-tag v0.3.5]
 *   node scripts/generate-release-notes.mjs --tag v0.3.6 --title-only
 */

import { execSync } from 'child_process'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')

/** Коммиты, не попадающие в пользовательское описание */
const SKIP_SUBJECT_RE =
  /^(test|ci|chore|docs):|fix\(ci\)|nightly|workflow_dispatch|ROADMAP|перенумеровать/i

const CATEGORY_RULES = [
  {
    id: 'runtime',
    heading: '**Обновление без переустановки**',
    match: (s) =>
      (/release|runtime|git clone|live runtime|installer\.nsh|userData|auto-update/i.test(s) &&
        !/collective|память|коллективн/i.test(s)) ||
      /^fix\(release\)/i.test(s)
  },
  {
    id: 'ui',
    heading: '**Интерфейс**',
    match: (s) => /^ui:/i.test(s) || /feat\(ui\)/i.test(s)
  },
  {
    id: 'agent',
    heading: '**Агент и интеграции**',
    match: (s) =>
      /collective|память|read tool|агент|github auth|mcp|интеграц|provider|ollama/i.test(s)
  },
  {
    id: 'features',
    heading: '**Новое**',
    match: (s) => /^feat(\([^)]+\))?:/i.test(s)
  },
  {
    id: 'fixes',
    heading: '**Исправления**',
    match: (s) => /^fix(\([^)]+\))?:/i.test(s)
  }
]

function runGit(cmd) {
  return execSync(cmd, { encoding: 'utf8', cwd: root }).trim()
}

function parseArgs(argv) {
  const args = { tag: '', prevTag: '', titleOnly: false }
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--tag') args.tag = argv[++i] ?? ''
    else if (argv[i] === '--prev-tag') args.prevTag = argv[++i] ?? ''
    else if (argv[i] === '--title-only') args.titleOnly = true
  }
  if (!args.tag) throw new Error('--tag обязателен')
  return args
}

function versionFromTag(tag) {
  return tag.replace(/^v/, '')
}

function previousTag(beforeTag) {
  const tags = runGit('git tag --list "v*" --sort=-version:refname')
    .split('\n')
    .filter((t) => /^v\d+\.\d+\.\d+$/.test(t))
  const idx = tags.indexOf(beforeTag)
  return idx >= 0 && idx + 1 < tags.length ? tags[idx + 1] : ''
}

function collectCommits(tag, prevTag) {
  const range = prevTag ? `${prevTag}..${tag}` : tag
  const out = runGit(`git log ${range} --pretty=format:%s --no-merges`)
  if (!out) return []
  return out.split('\n').map((s) => s.trim()).filter(Boolean)
}

/** feat(ui): текст → Текст */
function humanizeSubject(subject) {
  let text = subject
    .replace(/^(feat|fix|ui|docs|chore|test|ci)(\([^)]+\))?:\s*/i, '')
    .replace(/^feat:\s*/i, '')
    .trim()
  if (!text) return subject
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function categorize(commits) {
  const buckets = new Map(CATEGORY_RULES.map((r) => [r.id, []]))
  const seen = new Set()

  for (const subject of commits) {
    if (SKIP_SUBJECT_RE.test(subject)) continue
    const line = humanizeSubject(subject)
    if (seen.has(line)) continue
    seen.add(line)

    const rule = CATEGORY_RULES.find((r) => r.match(subject))
    const id = rule?.id ?? 'fixes'
    if (!buckets.has(id)) buckets.set(id, [])
    buckets.get(id).push(line)
  }

  return CATEGORY_RULES.filter((r) => (buckets.get(r.id)?.length ?? 0) > 0).map((r) => ({
    heading: r.heading,
    items: buckets.get(r.id)
  }))
}

function pickSubtitle(sections, commits) {
  const runtime = sections.find((s) => s.heading.includes('Обновление'))
  if (runtime?.items[0]) {
    const t = runtime.items[0].toLowerCase()
    if (/runtime|git clone|автообновлен|live runtime/i.test(t)) {
      return 'live runtime после автообновления'
    }
    if (t.length <= 60) return runtime.items[0].replace(/\.$/, '').toLowerCase()
  }

  const ui = sections.find((s) => s.heading.includes('Интерфейс'))
  if (ui?.items.length) return 'улучшения интерфейса'

  const feat = commits.find((c) => /^feat/i.test(c) && !SKIP_SUBJECT_RE.test(c))
  if (feat) {
    const h = humanizeSubject(feat)
    return h.length <= 55 ? h.replace(/\.$/, '').toLowerCase() : ''
  }

  return ''
}

export function generateReleaseTitle(tag, commits, sections) {
  const version = versionFromTag(tag)
  const subtitle = pickSubtitle(sections, commits)
  return subtitle ? `CodeViper ${version} — ${subtitle}` : `CodeViper ${version}`
}

export function generateReleaseNotes(tag, prevTag, commitsInput) {
  const version = versionFromTag(tag)
  const commits = commitsInput ?? collectCommits(tag, prevTag)
  const sections = categorize(commits)

  const lines = []
  const subtitle = pickSubtitle(sections, commits)
  const lead = subtitle
    ? `Главное в этом релизе: **${subtitle.charAt(0).toUpperCase()}${subtitle.slice(1)}**.`
    : `Релиз оболочки CodeViper **${version}**.`

  lines.push(`## CodeViper ${version}${subtitle ? ` — ${subtitle}` : ''}`, '', lead, '')

  if (sections.length > 0) {
    lines.push('### Что изменилось для пользователя', '')
    for (const { heading, items } of sections) {
      lines.push(heading)
      for (const item of items) {
        lines.push(`- ${item}`)
      }
      lines.push('')
    }
  } else {
    lines.push('### Что изменилось', '', '- Улучшения стабильности и мелкие правки', '')
  }

  lines.push(
    '### Как обновиться',
    '',
    '| Платформа | Файл |',
    '|-----------|------|',
    `| Windows | \`CodeViper-Setup-${version}.exe\` |`,
    `| Linux | \`CodeViper-${version}.AppImage\` |`,
    `| macOS | \`CodeViper-${version}.dmg\` |`,
    '',
    `Уже стоит предыдущая версия? Дождитесь баннера автообновления в приложении или скачайте установщик вручную.`,
    '',
    '### После обновления (Windows)',
    '',
    '1. Перезапустите CodeViper',
    '2. Подождите 1–3 минуты — в фоне может выполниться `git clone` (нужен **Git for Windows**)',
    '3. При готовности runtime появится баннер — **перезапустите ещё раз**',
    '4. Проверка: папка `%APPDATA%\\codeviper\\source\\.git` должна существовать',
    '',
    'Логи: `%APPDATA%\\codeviper\\logs\\bundled-source-*.ndjson` — ищите `clone ok` и `build complete`.',
    '',
    '### Требования',
    '',
    '- **Git for Windows** в PATH (для live runtime)',
    '- Windows 10/11, 8 ГБ RAM',
    '',
    '---',
    '',
    'Подробнее: [документация · live runtime](https://github.com/rkfsociety/CodeViper/blob/master/docs/development.md#обновление-без-переустановки-live-runtime) · [вики](https://github.com/rkfsociety/CodeViper/wiki)',
    ''
  )

  return lines.join('\n')
}

function main() {
  const { tag, prevTag: prevArg, titleOnly } = parseArgs(process.argv)
  const prevTag = prevArg || previousTag(tag)
  const commits = collectCommits(tag, prevTag)
  const sections = categorize(commits)

  if (titleOnly) {
    console.log(generateReleaseTitle(tag, commits, sections))
    return
  }
  console.log(generateReleaseNotes(tag, prevTag, commits))
}

const isMain =
  process.argv[1] &&
  (process.argv[1].endsWith('generate-release-notes.mjs') ||
    process.argv[1].endsWith('generate-release-notes'))

if (isMain) {
  main()
}
