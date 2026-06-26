const fs = require('fs')
const path = require('path')

const file = path.join(__dirname, '..', 'ROADMAP.md')
let text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')

const dupStart = text.indexOf('### 🔗 Тонкая оболочка + live runtime с GitHub\n\n> Установленный')
const ignoreStart = text.indexOf('### 🔗 Ignore и верификация mutating tools', dupStart)
if (dupStart === -1 || ignoreStart === -1) {
  console.error('duplicate block not found', dupStart, ignoreStart)
  process.exit(1)
}
text = text.slice(0, dupStart) + text.slice(ignoreStart)

// Fix level 1 header block before ignore (remove live runtime refs)
text = text.replace(
  /### 🔴 Уровень 1 — критично\n\n> Надёжность агента, \*\*live runtime с GitHub \(1–8\)\*\*,[^\n]+\n/,
  '### 🔴 Уровень 1 — критично (с пункта 9)\n\n> **Цепочки:** ignore **9–10**, roadmap/github **11–15**, split-view **28–30**, onboarding **41–43**, редактор **65–66**, worktree **70–72**, LSP **94–96**, i18n **150–154**.\n\n'
)

text = text.replace(
  /## 📋 В планах\n\n> Нумерация сквозная \*\*1…150\*\*[^\n]+\n/,
  '## 📋 В планах\n\n> Пункты **9…150**. **Не начинать, пока блок 0 не в «✅ Сделано»** — иначе каждый фикс агента снова требует релиза.\n\n'
)

text = text.replace(
  /Каждый пункт в «📋 В планах» следует \*\*одному шаблону\*\* — агент читает `ROADMAP\.md` и строит `set_self_improvement_plan` без уточнений\./,
  'Каждый пункт следует **одному шаблону** — агент читает `ROADMAP.md` и строит `set_self_improvement_plan`.'
)

text = text.replace(
  'N · [S/M/L/XL] · Краткое название — уровень 1…150',
  'N · [S/M/L/XL] · Краткое название — блок 0 | уровень 9…150'
)

text = text.replace(
  '**Промпт:** `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`\n\n**Правила:** нумерация **1…150 по убыванию важности** (уровень 1 — первым); внутри цепочки — строго по порядку; один пункт = один прогон; после проверки — `complete_self_improvement_item`.',
  '**Промпты:** блок 0 → `Выполни пункт N из ROADMAP.md — блок 0, live runtime.` · пункты 9+ → `Выполни пункт N из ROADMAP.md — самоулучшение CodeViper.`\n\n**Правила:** блок **0 (1–8)** — первым; затем **9…150**; внутри цепочки — строго по порядку.'
)

fs.writeFileSync(file, text, 'utf8')

const nums = (text.match(/^\*\*\d+ · /gm) || []).map((n) => parseInt(n.match(/\d+/)[0], 10))
const block0 = (text.match(/^\*\*\d+ · [^\n]+ — блок 0/gm) || []).length
console.log('items numbered:', nums.length, 'block0:', block0, 'has block0 section:', text.includes('## 🚨 Блок 0'))
