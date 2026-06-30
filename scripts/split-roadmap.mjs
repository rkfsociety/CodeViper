/**
 * Разбивает монолитный ROADMAP.md на смысловые подфайлы в ROADMAP/.
 * Только Node fs с encoding utf8 — не использовать sed/PowerShell replace.
 *
 * Запуск из корня репозитория: node scripts/split-roadmap.mjs
 */
import { mkdir, readFile, writeFile } from 'fs/promises'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = join(ROOT, 'ROADMAP.md')
const OUT_DIR = join(ROOT, 'ROADMAP')

const ITEM_HEADER_RE = /^\*\*(\d+)\s*·\s*(S|M|L|XL)\s*·\s*(.+?)\*\*/u

/** Смысловые группы: диапазон номеров → подфайл */
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

function normalizeLines(content) {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
}

function parseItems(content) {
  const lines = normalizeLines(content)
  const items = []
  let current = null
  let body = []

  for (const line of lines) {
    const match = line.match(ITEM_HEADER_RE)
    if (match) {
      if (current) items.push({ ...current, text: [current.header, ...body].join('\n').trimEnd() })
      current = { num: Number.parseInt(match[1], 10), size: match[2], header: line }
      body = []
    } else if (current) {
      body.push(line)
    }
  }
  if (current) items.push({ ...current, text: [current.header, ...body].join('\n').trimEnd() })
  return items
}

function extractPreamble(content) {
  const lines = normalizeLines(content)
  const plansIdx = lines.findIndex((l) => l.startsWith('## 📋 В планах'))
  if (plansIdx === -1) return lines.join('\n').trimEnd()
  return lines.slice(0, plansIdx).join('\n').trimEnd()
}

function formatChunkFile(chunk, items) {
  const lines = [
    `# ${chunk.title}`,
    '',
    chunk.blurb,
    '',
    `Всего пунктов: ${items.length}.`,
    ''
  ]
  for (const item of items) {
    lines.push(item.text, '', '')
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function formatSectionIndex(title, sizeLabel, intro, chunks) {
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
    const label = `${c.from}–${c.to}: ${c.title.replace(/^[SML]: /, '')}`
    lines.push(`- [${label}](${c.file})`)
  }
  return `${lines.join('\n').trimEnd()}\n`
}

function formatRootIndex(preamble, sChunks, mChunks, lChunks) {
  const nav = [
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
    `Всего **${sChunks.length + mChunks.length + lChunks.length}** смысловых файлов с пунктами **1…512**.`
  ]
  return `${nav.join('\n').trimEnd()}\n`
}

async function main() {
  const source = await readFile(SOURCE, 'utf8')
  if (source.includes('\uFFFD')) {
    throw new Error('ROADMAP.md содержит U+FFFD — сначала восстановите UTF-8')
  }

  const preamble = extractPreamble(source)
  const items = parseItems(source)
  if (items.length < 500) {
    throw new Error(`Ожидалось 500+ пунктов, найдено ${items.length}`)
  }

  await mkdir(OUT_DIR, { recursive: true })

  const written = []
  for (const chunk of CHUNKS) {
    const slice = items.filter((it) => it.num >= chunk.from && it.num <= chunk.to)
    if (slice.length === 0) {
      throw new Error(`Пустой чанк ${chunk.file} (${chunk.from}–${chunk.to})`)
    }
    if (slice.length > 50) {
      throw new Error(`Чанк ${chunk.file} превышает лимит 50: ${slice.length}`)
    }
    const path = join(OUT_DIR, chunk.file)
    await writeFile(path, formatChunkFile(chunk, slice), 'utf8')
    written.push({ ...chunk, count: slice.length })
  }

  const sChunks = CHUNKS.filter((c) => c.file.startsWith('1'))
  const mChunks = CHUNKS.filter((c) => c.file.startsWith('2'))
  const lChunks = CHUNKS.filter((c) => c.file.startsWith('3'))

  await writeFile(
    join(OUT_DIR, '00-overview.md'),
    `${preamble}\n\n## Навигация по разделам\n\n- [S — простые](10-s.md)\n- [M — средние](20-m.md)\n- [L — крупные](30-l.md)\n`,
    'utf8'
  )

  await writeFile(
    join(OUT_DIR, '10-s.md'),
    formatSectionIndex(
      'S',
      'S',
      'Простые задачи: одна правка, 1–2 файла, быстрая проверка. Пункты **1–135**.',
      sChunks
    ),
    'utf8'
  )

  await writeFile(
    join(OUT_DIR, '20-m.md'),
    formatSectionIndex(
      'M',
      'M',
      'Средние задачи: несколько файлов, IPC/тесты/E2E. Пункты **136–511**.',
      mChunks
    ),
    'utf8'
  )

  await writeFile(
    join(OUT_DIR, '30-l.md'),
    formatSectionIndex(
      'L',
      'L',
      'Крупные задачи: новые подсистемы, длительная проверка. Пункт **512**.',
      lChunks
    ),
    'utf8'
  )

  await writeFile(join(ROOT, 'ROADMAP.md'), formatRootIndex(preamble, sChunks, mChunks, lChunks), 'utf8')

  const total = written.reduce((n, c) => n + c.count, 0)
  console.log(`OK: ${written.length} файлов, ${total} пунктов`)
  for (const w of written) {
    console.log(`  ${w.file}: ${w.count} (${w.from}–${w.to})`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
