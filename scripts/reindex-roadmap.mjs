/**
 * Сквозная переиндексация split ROADMAP/ → 1…N без пропусков.
 * UTF-8 only. Запуск: node scripts/reindex-roadmap.mjs
 */
import { readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const ITEM_HEADER_RE = /^\*\*(\d+)\s*·\s*(S|M|L|XL)\s*·\s*(.+?)\*\*/u

const CHUNKS = [
  {
    file: '11-s-ui-and-integrations.md',
    title: 'S: UI, интеграции и уведомления',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'интерфейс, webhooks, P2P, метрики и интеграции.'
  },
  {
    file: '12-s-autodetect-and-quality.md',
    title: 'S: Автодетект настроек и качество кода',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'авто-обнаружение проблем в настройках, тестах и инфраструктуре.'
  },
  {
    file: '13-s-generation-and-docs.md',
    title: 'S: Генерация CI, пайплайнов и документации',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'авто-генерация CI/CD, конфигов и пользовательской документации.'
  },
  {
    file: '21-m-ux-subagents-and-vcs.md',
    title: 'M: UX, субагенты, git и IPC',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'модалки, логи, субагенты, git, worktree и контракты IPC.'
  },
  {
    file: '22-m-vcs-integrations-and-lsp.md',
    title: 'M: Сервисы, интеграции и LSP I',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'services.ts, провайдеры, LSP, автоматизации, P2P и диаграммы.'
  },
  {
    file: '23-m-symbols-worktrees-and-lsp.md',
    title: 'M: Автодетект runtime, символы и LSP II',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'IPC/UI-детект, find_symbol, LSP для редких языков.'
  },
  {
    file: '24-m-lsp-rag-and-reports.md',
    title: 'M: Onboarding, RAG и отчёты',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'onboarding, RAG, чанки, эмбеддинги и отчёты качества.'
  },
  {
    file: '25-m-language-support-and-diagrams.md',
    title: 'M: Векторные БД и диаграммы Git',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'Milvus/Qdrant, индексация и диаграммы по Git-истории.'
  },
  {
    file: '26-m-diagnostics-panels-and-settings.md',
    title: 'M: Диаграммы, LSP III и диагностика',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'Git-диаграммы, LSP для языков, панели и диагностика.'
  },
  {
    file: '27-m-language-support-and-voice-ui.md',
    title: 'M: Языки LSP IV и вкладки настроек',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'LSP, BehaviorTab, ModelTab и голосовой UI.'
  },
  {
    file: '28-m-context-providers-and-design.md',
    title: 'M: Интеграции, контекст и UX-гайды',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'вкладки настроек, context manager, дизайн и UX-гайды.'
  },
  {
    file: '29-m-guides-and-architecture-docs.md',
    title: 'M: Developer-гайды и API-документация',
    blurbPrefix: 'Пункты',
    blurbSuffix: 'гайды для разработчиков, wiki и API архитектурных панелей.'
  },
  {
    file: '31-l-major-initiatives.md',
    title: 'L: Крупные инициативы',
    blurbPrefix: 'Пункт',
    blurbSuffix: 'многокомпонентные подсистемы и длительная проверка.'
  }
]

function parseItems(content) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const items = []
  let current = null
  let body = []

  for (const line of lines) {
    const match = line.match(ITEM_HEADER_RE)
    if (match) {
      if (current) items.push({ ...current, body: [...body] })
      current = {
        num: Number.parseInt(match[1], 10),
        size: match[2],
        title: match[3],
        header: line
      }
      body = []
    } else if (current) {
      body.push(line)
    }
  }
  if (current) items.push({ ...current, body: [...body] })
  return items
}

function formatItem(item, newNum) {
  const header = item.header.replace(/^\*\*\d+/, `**${newNum}`)
  const trimmedBody = item.body.join('\n').replace(/\n+$/, '')
  return trimmedBody ? `${header}\n${trimmedBody}` : header
}

function formatChunkFile(chunk, items, from, to) {
  const rangeLabel = from === to ? `${from}` : `${from}–${to}`
  const blurb =
    from === to
      ? `${chunk.blurbPrefix} ${from}: ${chunk.blurbSuffix}`
      : `${chunk.blurbPrefix} ${rangeLabel}: ${chunk.blurbSuffix}`
  const lines = [`# ${chunk.title}`, '', blurb, '', `Всего пунктов: ${items.length}.`, '']
  for (const item of items) {
    lines.push(item.text, '', '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

async function main() {
  const outDir = join(ROOT, 'ROADMAP')
  const allItems = []

  for (const chunk of CHUNKS) {
    const path = join(outDir, chunk.file)
    const content = await readFile(path, 'utf8')
    if (content.includes('\uFFFD')) throw new Error(`${chunk.file}: U+FFFD`)
    const items = parseItems(content)
    for (const item of items) {
      allItems.push({ chunk, item })
    }
  }

  allItems.sort((a, b) => a.item.num - b.item.num || a.item.title.localeCompare(b.item.title))

  let nextNum = 1
  const byFile = new Map(CHUNKS.map((c) => [c.file, []]))
  const ranges = new Map()

  for (const entry of allItems) {
    const newNum = nextNum++
    const text = formatItem(entry.item, newNum)
    byFile.get(entry.chunk.file).push({ num: newNum, text })
    if (!ranges.has(entry.chunk.file)) {
      ranges.set(entry.chunk.file, { from: newNum, to: newNum })
    } else {
      ranges.get(entry.chunk.file).to = newNum
    }
  }

  const total = allItems.length

  for (const chunk of CHUNKS) {
    const items = byFile.get(chunk.file)
    const range = ranges.get(chunk.file) ?? { from: 0, to: 0 }
    await writeFile(join(outDir, chunk.file), formatChunkFile(chunk, items, range.from, range.to), 'utf8')
  }

  const sChunks = CHUNKS.filter((c) => c.file.startsWith('1'))
  const mChunks = CHUNKS.filter((c) => c.file.startsWith('2'))
  const lChunks = CHUNKS.filter((c) => c.file.startsWith('3'))

  const sFrom = ranges.get(sChunks[0].file)?.from ?? 1
  const sTo = ranges.get(sChunks[sChunks.length - 1].file)?.to ?? sFrom
  const mFrom = ranges.get(mChunks[0].file)?.from ?? sTo + 1
  const mTo = ranges.get(mChunks[mChunks.length - 1].file)?.to ?? mFrom
  const lFrom = ranges.get(lChunks[0].file)?.from ?? mTo + 1
  const lTo = ranges.get(lChunks[0].file)?.to ?? lFrom

  function sectionIndex(sizeLabel, introRange, introTail, chunks) {
    const lines = [
      `# ROADMAP — ${sizeLabel}`,
      '',
      introTail.replace(/\*\*\d+–\d+\*\*/, `**${introRange.from}–${introRange.to}**`).replace(/\*\*\d+\*\*/, `**${introRange.from}**`),
      '',
      '- В каждом подфайле не более 50 пунктов для читаемости.',
      '- Нумерация сквозная — переходите по ссылкам на смысловые блоки ниже.',
      '',
      '## Блоки',
      ''
    ]
    for (const c of chunks) {
      const r = ranges.get(c.file)
      if (!r || r.from === 0) continue
      const label = r.from === r.to ? `${r.from}: ${c.title.replace(/^[SML]: /, '')}` : `${r.from}–${r.to}: ${c.title.replace(/^[SML]: /, '')}`
      lines.push(`- [${label}](${c.file})`)
    }
    return `${lines.join('\n').trimEnd()}\n`
  }

  await writeFile(
    join(outDir, '10-s.md'),
    sectionIndex(
      'S',
      { from: sFrom, to: sTo },
      `Простые задачи: одна правка, 1–2 файла, быстрая проверка. Пункты **${sFrom}–${sTo}**.`,
      sChunks
    ),
    'utf8'
  )
  await writeFile(
    join(outDir, '20-m.md'),
    sectionIndex(
      'M',
      { from: mFrom, to: mTo },
      `Средние задачи: несколько файлов, IPC/тесты/E2E. Пункты **${mFrom}–${mTo}**.`,
      mChunks
    ),
    'utf8'
  )
  await writeFile(
    join(outDir, '30-l.md'),
    sectionIndex(
      'L',
      { from: lFrom, to: lTo },
      `Крупные задачи: новые подсистемы, длительная проверка. Пункт **${lFrom}**.`,
      lChunks
    ),
    'utf8'
  )

  const overviewPath = join(outDir, '00-overview.md')
  let overview = await readFile(overviewPath, 'utf8')
  overview = overview.replace(/пункты \*\*1…\d+\*\*/iu, `пункты **1…${total}**`)
  overview = overview.replace(/Правила:\*\* пункты \*\*1…\d+/u, `Правила:** пункты **1…${total}`)
  await writeFile(overviewPath, overview, 'utf8')

  const root = [
    '# Дорожная карта CodeViper',
    '',
    'Активные задачи разбиты по папке [ROADMAP](ROADMAP). Выполненное — [ROADMAP_DONE.md](ROADMAP_DONE.md). Назад в [README](README.md).',
    '',
    '## Правила навигации',
    '',
    '- Открывайте подфайл по размеру (S/M/L) и теме.',
    '- В каждом roadmap-подфайле не более 50 пунктов для читаемости.',
    '- Нумерация сквозная и неизменна — переходите по ссылкам на блоки ниже.',
    '',
    '## Разделы',
    '',
    '- [Обзор и формат](ROADMAP/00-overview.md)',
    '- [S — простые](ROADMAP/10-s.md)',
    '- [M — средние](ROADMAP/20-m.md)',
    '- [L — крупные](ROADMAP/30-l.md)',
    '',
    `Всего **${CHUNKS.length}** смысловых файлов с пунктами **1…${total}**.`
  ]
  await writeFile(join(ROOT, 'ROADMAP.md'), `${root.join('\n').trimEnd()}\n`, 'utf8')

  const readmePath = join(ROOT, 'README.md')
  let readme = await readFile(readmePath, 'utf8')
  readme = readme.replace(/ROADMAP\.md\) \(\d+ задач/, `ROADMAP.md) (${total} задач`)
  await writeFile(readmePath, readme, 'utf8')

  const nums = allItems.map((_, i) => i + 1)
  const max = nums.length
  const missing = []
  for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i)
  console.log(`OK: ${total} пунктов, диапазон 1…${max}`, missing.length ? `❌ пропуски: ${missing}` : '✅ без пропусков')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
