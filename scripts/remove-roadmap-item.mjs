/**
 * Удаляет пункт N из split ROADMAP/ и переиндексирует сквозную нумерацию.
 * UTF-8 only. Запуск: node scripts/remove-roadmap-item.mjs <N>
 */
import { readFile, writeFile, readdir } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TARGET = Number.parseInt(process.argv[2] ?? '', 10)
const ITEM_HEADER_RE = /^\*\*(\d+)\s*·\s*(S|M|L|XL)\s*·\s*(.+?)\*\*/u

const CHUNKS = [
  {
    file: '11-s-ui-and-integrations.md',
    from: 1,
    to: 45,
    title: 'S: UI, интеграции и уведомления',
    blurb: 'Пункты 1–45: интерфейс, webhooks, P2P, метрики и интеграции.'
  },
  {
    file: '12-s-autodetect-and-quality.md',
    from: 46,
    to: 90,
    title: 'S: Автодетект настроек и качество кода',
    blurb: 'Пункты 46–90: авто-обнаружение проблем в настройках, тестах и инфраструктуре.'
  },
  {
    file: '13-s-generation-and-docs.md',
    from: 91,
    to: 135,
    title: 'S: Генерация CI, пайплайнов и документации',
    blurb: 'Пункты 91–135: авто-генерация CI/CD, конфигов и пользовательской документации.'
  },
  {
    file: '21-m-ux-subagents-and-vcs.md',
    from: 136,
    to: 180,
    title: 'M: UX, субагенты, git и IPC',
    blurb: 'Пункты 136–180: модалки, логи, субагенты, git, worktree и контракты IPC.'
  },
  {
    file: '22-m-vcs-integrations-and-lsp.md',
    from: 181,
    to: 225,
    title: 'M: Сервисы, интеграции и LSP I',
    blurb: 'Пункты 181–225: services.ts, провайдеры, LSP, автоматизации, P2P и диаграммы.'
  },
  {
    file: '23-m-symbols-worktrees-and-lsp.md',
    from: 226,
    to: 270,
    title: 'M: Автодетект runtime, символы и LSP II',
    blurb: 'Пункты 226–270: IPC/UI-детект, find_symbol, LSP для редких языков.'
  },
  {
    file: '24-m-lsp-rag-and-reports.md',
    from: 271,
    to: 315,
    title: 'M: Onboarding, RAG и отчёты',
    blurb: 'Пункты 271–315: onboarding, RAG, чанки, эмбеддинги и отчёты качества.'
  },
  {
    file: '25-m-language-support-and-diagrams.md',
    from: 316,
    to: 360,
    title: 'M: Векторные БД и диаграммы Git',
    blurb: 'Пункты 316–360: Milvus/Qdrant, индексация и диаграммы по Git-истории.'
  },
  {
    file: '26-m-diagnostics-panels-and-settings.md',
    from: 361,
    to: 405,
    title: 'M: Диаграммы, LSP III и диагностика',
    blurb: 'Пункты 361–405: Git-диаграммы, LSP для языков, панели и диагностика.'
  },
  {
    file: '27-m-language-support-and-voice-ui.md',
    from: 406,
    to: 450,
    title: 'M: Языки LSP IV и вкладки настроек',
    blurb: 'Пункты 406–450: LSP, BehaviorTab, ModelTab и голосовой UI.'
  },
  {
    file: '28-m-context-providers-and-design.md',
    from: 451,
    to: 495,
    title: 'M: Интеграции, контекст и UX-гайды',
    blurb: 'Пункты 451–495: вкладки настроек, context manager, дизайн и UX-гайды.'
  },
  {
    file: '29-m-guides-and-architecture-docs.md',
    from: 496,
    to: 511,
    title: 'M: Developer-гайды и API-документация',
    blurb: 'Пункты 496–511: гайды для разработчиков, wiki и API архитектурных панелей.'
  },
  {
    file: '31-l-major-initiatives.md',
    from: 512,
    to: 512,
    title: 'L: Крупные инициативы',
    blurb: 'Пункт 512: многокомпонентные подсистемы и длительная проверка.'
  }
]

function shiftNum(n) {
  return n > TARGET ? n - 1 : n
}

function shiftRange(from, to) {
  return { from: shiftNum(from), to: shiftNum(to) }
}

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

function formatItem(item) {
  const newNum = shiftNum(item.num)
  const header = item.header.replace(/^\*\*\d+/, `**${newNum}`)
  const trimmedBody = item.body.join('\n').replace(/\n+$/, '')
  return trimmedBody ? `${header}\n${trimmedBody}` : header
}

function formatChunkFile(chunk, items) {
  const range = shiftRange(chunk.from, chunk.to)
  const blurb = chunk.blurb
    .replace(/Пункты \d+–\d+/, `Пункты ${range.from}–${range.to}`)
    .replace(/Пункт \d+/, `Пункт ${range.from}`)
  const lines = [`# ${chunk.title}`, '', blurb, '', `Всего пунктов: ${items.length}.`, '']
  for (const item of items) {
    lines.push(formatItem(item), '', '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function formatSectionIndex(sizeLabel, introTemplate, chunks) {
  const intro = introTemplate.replace(/\d+–\d+/g, (m) => {
    const [a, b] = m.split('–').map(Number)
    return `${shiftNum(a)}–${shiftNum(b)}`
  }).replace(/Пункт \*\*(\d+)\*\*/, (_, n) => `Пункт **${shiftNum(Number(n))}**`)

  const lines = [
    `# ROADMAP — ${sizeLabel}`,
    '',
    intro,
    '',
    '- В каждом подфайле не более 50 пунктов для читаемости.',
    '- Нумерация сквозная — переходите по ссылкам на смысловые блоки ниже.',
    '',
    '## Блоки',
    ''
  ]
  for (const c of chunks) {
    const range = shiftRange(c.from, c.to)
    const label = `${range.from}–${range.to}: ${c.title.replace(/^[SML]: /, '')}`
    lines.push(`- [${label}](${c.file})`)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

async function main() {
  if (!Number.isFinite(TARGET) || TARGET < 1) {
    throw new Error('Укажите номер пункта: node scripts/remove-roadmap-item.mjs <N>')
  }

  const outDir = join(ROOT, 'ROADMAP')
  let removed = false
  let total = 0

  for (const chunk of CHUNKS) {
    const path = join(outDir, chunk.file)
    const content = await readFile(path, 'utf8')
    if (content.includes('\uFFFD')) throw new Error(`${chunk.file}: U+FFFD`)
    const items = parseItems(content).filter((item) => {
      if (item.num === TARGET) {
        removed = true
        return false
      }
      return true
    })
    total += items.length
    await writeFile(path, formatChunkFile(chunk, items), 'utf8')
  }

  if (!removed) throw new Error(`Пункт ${TARGET} не найден`)

  const sChunks = CHUNKS.filter((c) => c.file.startsWith('1'))
  const mChunks = CHUNKS.filter((c) => c.file.startsWith('2'))
  const lChunks = CHUNKS.filter((c) => c.file.startsWith('3'))

  await writeFile(
    join(outDir, '10-s.md'),
    formatSectionIndex(
      'S',
      'Простые задачи: одна правка, 1–2 файла, быстрая проверка. Пункты **1–135**.',
      sChunks
    ),
    'utf8'
  )
  await writeFile(
    join(outDir, '20-m.md'),
    formatSectionIndex(
      'M',
      'Средние задачи: несколько файлов, IPC/тесты/E2E. Пункты **136–511**.',
      mChunks
    ),
    'utf8'
  )
  await writeFile(
    join(outDir, '30-l.md'),
    formatSectionIndex('L', 'Крупные задачи: новые подсистемы, длительная проверка. Пункт **512**.', lChunks),
    'utf8'
  )

  const maxNum = total
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
    `Всего **${CHUNKS.length}** смысловых файлов с пунктами **1…${maxNum}**.`
  ]
  await writeFile(join(ROOT, 'ROADMAP.md'), `${root.join('\n').trimEnd()}\n`, 'utf8')

  const readmePath = join(ROOT, 'README.md')
  let readme = await readFile(readmePath, 'utf8')
  readme = readme.replace(/ROADMAP\.md\) \(\d+ задач/, `ROADMAP.md) (${maxNum} задач`)
  await writeFile(readmePath, readme, 'utf8')

  console.log(`OK: удалён пункт ${TARGET}, осталось ${maxNum} пунктов`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
