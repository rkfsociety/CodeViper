/**
 * Пересортировка ROADMAP.md по важности. Запуск: node scripts/reorder-roadmap.js
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const ROADMAP = path.join(ROOT, 'ROADMAP.md')

const TIERS = [
  {
    title: '🔴 Уровень 1 — критично',
    desc: 'Надёжность агента, безопасность, тесты ядра, git-инструменты, RAG/MCP.',
    ids: [
      17, 18, 19, 68, 81, 82, 83, 85, 46, 124, 89, 142, 20, 84, 132, 133, 134, 99
    ]
  },
  {
    title: '🟠 Уровень 2 — высокая польза',
    desc: 'Ежедневный UX, превью файлов, onboarding, провайдеры, субагенты, E2E, ModelTab.',
    ids: [
      29, 3, 4, 5, 6, 72, 73, 66, 79, 69, 128, 126, 75, 27, 28, 30, 31, 32, 86, 88,
      130, 131, 94, 96, 97, 101, 102, 147, 148, 67, 119, 120, 125, 2, 52, 53, 74, 33,
      34, 9, 10
    ]
  },
  {
    title: '🟡 Уровень 3 — средняя польза',
    desc: 'Символы, worktree, рефакторинг IPC/services, интеграции, LSP, автоматизации, P2P.',
    ids: [
      14, 15, 16, 24, 25, 26, 54, 55, 61, 62, 136, 138, 135, 103, 104, 105, 127, 129,
      80, 95, 98, 45, 87, 90, 91, 92, 93, 11, 12, 13, 35, 36, 37, 38, 39, 40, 41, 42,
      43, 44, 139, 140, 141, 70, 76
    ]
  },
  {
    title: '🟢 Уровень 4 — низкий приоритет',
    desc: 'Голос, рефакторинг монолитов, i18n, Docker, polish, E2E расширенный, платформа.',
    ids: [
      7, 8, 21, 22, 23, 117, 56, 57, 58, 59, 60, 63, 64, 65, 106, 107, 108, 109, 110,
      111, 112, 113, 114, 115, 116, 118, 71, 77, 78, 100, 121, 122, 137, 143, 123,
      145, 146, 144, 47, 48, 49, 50, 51, 1
    ]
  }
]

const flat = TIERS.flatMap((t) => t.ids)
if (flat.length !== 148 || new Set(flat).size !== 148) {
  const missing = []
  for (let i = 1; i <= 148; i++) if (!flat.includes(i)) missing.push(i)
  const dups = flat.filter((n, i, a) => a.indexOf(n) !== i)
  console.error('Order invalid:', flat.length, 'items, missing:', missing, 'dups:', dups)
  process.exit(1)
}

const text = fs.readFileSync(ROADMAP, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const start = text.indexOf('## 📋 В планах')
const end = text.indexOf('\n---\n\n## ✅ Сделано')
if (start < 0 || end < 0) {
  console.error('Markers not found')
  process.exit(1)
}

const planned = text.slice(start, end)
const itemRe =
  /\*\*(\d+) · ([^\n]+)\*\* — приор\. [^\n]+\n((?:- \*\*[^\n]+\n)+)/g
const items = new Map()
let m
while ((m = itemRe.exec(planned)) !== null) {
  items.set(parseInt(m[1], 10), { header: m[2], body: m[3] })
}

if (items.size !== 148) {
  console.error('Parsed', items.size, 'items, expected 148')
  process.exit(1)
}

function renderItem(n, oldId, tierNum) {
  const it = items.get(oldId)
  if (!it) throw new Error(`Missing item ${oldId}`)
  return `**${n} · ${it.header}** — уровень ${tierNum}\n${it.body}`
}

let blocks = []
let n = 1
for (let ti = 0; ti < TIERS.length; ti++) {
  const tier = TIERS[ti]
  const tierNum = ti + 1
  blocks.push(`### ${tier.title}`)
  blocks.push('')
  blocks.push(`> ${tier.desc} Внутри уровня — сверху вниз; цепочки (split-view 21–23, редактор 58–59, worktree 63–65, LSP 87–89, onboarding 34–36, i18n 143–147) — строго по порядку.`)
  blocks.push('')
  for (const oldId of tier.ids) {
    blocks.push(renderItem(n, oldId, tierNum))
    blocks.push('')
    n++
  }
}

const newPlanned = `## 📋 В планах

> Нумерация сквозная **1…148** — **отсортировано по важности и пользе** (уровни 1→4). Сначала надёжность и ядро, затем UX, расширения, polish. Сложность: S / M / L / XL. Выполненные цепочки см. «✅ Сделано».

${blocks.join('\n').trim()}
`

const newText =
  text.slice(0, start) +
  newPlanned +
  text.slice(end)

// Update header rules
const updated = newText.replace(
  /(\*\*Правила:\*\* нумерация сквозная \(1…148\);[^\n]+)/,
  '**Правила:** нумерация **1…148 по убыванию важности** (уровень 1 — первым); внутри цепочки — строго по порядку; один пункт = один прогон; после проверки — `complete_self_improvement_item`.'
).replace(
  /> \*\*Принцип чтения:\*\* задачи сгруппированы в цепочки[^]+?Между группами порядок произвольный\./,
  '> **Принцип чтения:** пункты **1…148 отсортированы по важности** (🔴→🟢). Внутри цепочки — строгий порядок; между несвязанными пунктами — тоже сверху вниз. Пропускать к более низкому уровню без причины не рекомендуется.'
)

fs.writeFileSync(ROADMAP, updated, 'utf8')
console.log('OK: reordered 148 items into 4 tiers')
