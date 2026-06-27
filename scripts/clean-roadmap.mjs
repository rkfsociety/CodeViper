import { readFileSync, writeFileSync } from 'fs'

const path = 'ROADMAP.md'
const lines = readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

let inPlans = false
let inDone = false
const result = []

const crossRefMap = new Map()
for (let old = 3; old <= 142; old++) {
  crossRefMap.set(old, old - 2)
}

function renumberItemLine(line) {
  return line.replace(/^\*\*(\d+)( · )/, (_, n, sep) => {
    const old = parseInt(n, 10)
    const neu = crossRefMap.get(old) ?? old
    return `**${neu}${sep}`
  })
}

function fixCrossRefs(text) {
  let out = text
  // п. 21–23, п. 58, etc.
  out = out.replace(/п\.\s*(\d+)(?:\s*[–-]\s*(\d+))?/g, (_, a, b) => {
    const na = crossRefMap.get(parseInt(a, 10)) ?? a
    if (b) {
      const nb = crossRefMap.get(parseInt(b, 10)) ?? b
      return `п. ${na}–${nb}`
    }
    return `п. ${na}`
  })
  // ranges like **3–7**, **10–12**
  out = out.replace(/\*\*(\d+)[–-](\d+)\*\*/g, (_, a, b) => {
    const na = crossRefMap.get(parseInt(a, 10)) ?? a
    const nb = crossRefMap.get(parseInt(b, 10)) ?? b
    return `**${na}–${nb}**`
  })
  return out
}

for (const line of lines) {
  if (line.startsWith('## 📋') || line.startsWith('## В планах')) {
    inPlans = true
    inDone = false
    result.push(line)
    continue
  }
  if (line.startsWith('## ✅') && line.includes('Сделано')) {
    inPlans = false
    inDone = true
    result.push(line)
    continue
  }
  if (line.startsWith('## ✅ Блок 0')) {
    inPlans = false
    inDone = false
    result.push(line)
    continue
  }

  if (inPlans && line.match(/^\*\*\d+ · /)) {
    result.push(renumberItemLine(line))
    continue
  }

  if (!inDone && !inPlans) {
    // meta / intro lines before В планах
    let fixed = line
    fixed = fixed.replace(/3…142/g, '1…140')
    fixed = fixed.replace(/3\.\.\.142/g, '1…140')
    fixed = fixed.replace(/пункты \*\*3…142\*\*/g, 'пункты **1…140**')
    fixed = fixed.replace(/Пункты \*\*3…142\*\*/g, 'Пункты **1…140**')
    fixed = fixed.replace(/уровень 3…142/g, 'уровень из заголовка группы')
    fixed = fixed.replace(/Пункты \*\*8–53\*\*/g, 'Пункты **6–51**')
    fixed = fixed.replace(/Пункты \*\*55–99\*\*/g, 'Пункты **52–96**')
    fixed = fixed.replace(/Пункты \*\*100–143\*\*/g, 'Пункты **97–140**')
    fixed = fixCrossRefs(fixed)
    result.push(fixed)
    continue
  }

  if (inPlans) {
    result.push(fixCrossRefs(line))
    continue
  }

  result.push(line)
}

writeFileSync(path, result.join('\n'), 'utf8')

// validate
const t = readFileSync(path, 'utf8')
const inPlansSection = t.split('## 📋 В планах')[1]?.split('## ✅ Сделано')[0] ?? ''
const nums = (inPlansSection.match(/^\*\*(\d+) · /gm) || []).map((n) =>
  parseInt(n.match(/\d+/)[0], 10)
)
const max = Math.max(...nums)
const missing = []
for (let i = 1; i <= max; i++) if (!nums.includes(i)) missing.push(i)
const dups = nums.filter((n, i, a) => a.indexOf(n) !== i)
console.log('Пунктов:', nums.length, '| 1..' + max, missing.length ? '❌ пропуски:' + missing : dups.length ? '❌ дубли:' + dups : '✅ чисто')
