/**
 * Сортировка ROADMAP.md по сложности выполнения (S → M → L → XL).
 * Запуск: node scripts/sort-roadmap-by-complexity.mjs
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const ROADMAP = path.join(ROOT, 'ROADMAP.md')

const SIZE_ORDER = { S: 0, M: 1, L: 2, XL: 3 }

const SECTIONS = [
  {
    size: 'S',
    title: '🟢 S — простые',
    desc: 'Одна правка, 1–2 файла, быстрая проверка. Начинать с этих пунктов.',
  },
  {
    size: 'M',
    title: '🟡 M — средние',
    desc: 'Несколько файлов, IPC/тесты/E2E, умеренный объём работы.',
  },
  {
    size: 'L',
    title: '🟠 L — крупные',
    desc: 'Много компонентов, новые подсистемы, длительная проверка.',
  },
  {
    size: 'XL',
    title: '🔴 XL — эпики',
    desc: 'Крупные изменения архитектуры; разбивать на подзадачи при необходимости.',
  },
]

const text = fs.readFileSync(ROADMAP, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
const start = text.indexOf('## 📋 В планах')
if (start < 0) {
  console.error('Marker "## 📋 В планах" not found')
  process.exit(1)
}

const preamble = text.slice(0, start)
const planned = text.slice(start)

const itemRe =
  /^\*\*(\d+) · (S|M|L|XL) · ([^\n]+)\*\* — уровень (\d)\n((?:- \*\*[^\n]+\n)+)/gm
const items = []
let m
while ((m = itemRe.exec(planned)) !== null) {
  items.push({
    oldNum: parseInt(m[1], 10),
    size: m[2],
    title: m[3],
    level: parseInt(m[4], 10),
    body: m[5],
  })
}

if (items.length !== 532) {
  console.error(`Parsed ${items.length} items, expected 532`)
  process.exit(1)
}

items.sort((a, b) => {
  const sd = SIZE_ORDER[a.size] - SIZE_ORDER[b.size]
  if (sd !== 0) return sd
  const ld = a.level - b.level
  if (ld !== 0) return ld
  return a.oldNum - b.oldNum
})

const bySize = Object.fromEntries(SECTIONS.map((s) => [s.size, []]))
for (const item of items) {
  bySize[item.size].push(item)
}

function renderItem(n, item) {
  return `**${n} · ${item.size} · ${item.title}** — уровень ${item.level}\n${item.body}`
}

const blocks = []
let n = 1
for (const section of SECTIONS) {
  const group = bySize[section.size]
  if (group.length === 0) continue
  blocks.push(`### ${section.title}`)
  blocks.push('')
  blocks.push(`> ${section.desc} Пункты **${n}–${n + group.length - 1}**.`)
  blocks.push('')
  for (const item of group) {
    blocks.push(renderItem(n, item))
    blocks.push('')
    n++
  }
}

const counts = SECTIONS.map((s) => `${s.size}: ${bySize[s.size].length}`).join(', ')

const newPlanned = `## 📋 В планах

> Пункты **1…532** — **отсортированы по сложности выполнения** (${counts}). Внутри группы S/M/L/XL — сначала уровень 2, затем 3, затем 4.

${blocks.join('\n').trim()}
`

let newText = preamble + newPlanned

// Обновить шапку формата
newText = newText.replace(
  /\*\*Правила:\*\* пункты \*\*1…\d+\*\*;[^\n]+/,
  '**Правила:** пункты **1…532 по возрастанию сложности** (S → M → L → XL); один пункт = один прогон самоулучшения.',
)

fs.writeFileSync(ROADMAP, newText, 'utf8')
console.log('OK: sorted 532 items by complexity:', counts)
