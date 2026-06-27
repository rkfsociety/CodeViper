import { readFileSync, writeFileSync } from 'fs'

const src = readFileSync('ROADMAP.md', 'utf8').replace(/\r\n/g, '\n')
const lines = src.split('\n')

// Ожидаем уже разделённый ROADMAP: только планы + шапка с форматом
const plansStart = lines.findIndex((l) => l.startsWith('## 📋') || l.startsWith('## В планах'))
if (plansStart < 0) {
  console.error('Раздел «В планах» не найден')
  process.exit(1)
}

const header = lines.slice(0, plansStart).join('\n').trimEnd()
const plans = lines.slice(plansStart).join('\n').trimEnd()

const doneSrc = readFileSync('ROADMAP_DONE.md', 'utf8').replace(/\r\n/g, '\n')
if (!doneSrc.includes('## Сделано')) {
  console.error('ROADMAP_DONE.md: нет раздела «Сделано»')
  process.exit(1)
}

writeFileSync(
  'ROADMAP.md',
  `${header}\n\n${plans}\n`,
  'utf8'
)

const planCount = (plans.match(/^\*\*\d+ · /gm) || []).length
console.log('ROADMAP.md:', planCount, 'пунктов — только «В планах»')
console.log('ROADMAP_DONE.md: история выполненного')
