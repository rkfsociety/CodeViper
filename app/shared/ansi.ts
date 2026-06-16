// Минимальный парсер ANSI SGR-кодов (цвета, жирность, подчёркивание) в сегменты.
// Используется для подсветки вывода команд в TerminalPanel.

export interface AnsiSegment {
  text: string
  color?: string
  background?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

interface AnsiStyle {
  color?: string
  background?: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
}

// Палитра под тёмную тему CodeViper (имена → hex). bright-варианты светлее.
const FG_COLORS: Record<number, string> = {
  30: '#6e7681', // black (приглушённый)
  31: '#f85149', // red
  32: '#3fb950', // green
  33: '#d29922', // yellow
  34: '#58a6ff', // blue
  35: '#bc8cff', // magenta
  36: '#39c5cf', // cyan
  37: '#b1bac4', // white
  90: '#8b949e', // bright black
  91: '#ffa198', // bright red
  92: '#7ee787', // bright green
  93: '#e3b341', // bright yellow
  94: '#79c0ff', // bright blue
  95: '#d2a8ff', // bright magenta
  96: '#56d4dd', // bright cyan
  97: '#f0f6fc' // bright white
}

const BG_COLORS: Record<number, string> = {
  40: '#161b22',
  41: '#67060c',
  42: '#1b4721',
  43: '#5a4710',
  44: '#0d3a8c',
  45: '#3c1e70',
  46: '#0f5057',
  47: '#30363d'
}

// eslint-disable-next-line no-control-regex
const ANSI_PATTERN = new RegExp(String.fromCharCode(27) + '\\[([0-9;]*)m', 'g')

function applyCodes(style: AnsiStyle, codes: number[]): AnsiStyle {
  let next = { ...style }
  for (let i = 0; i < codes.length; i++) {
    const code = codes[i]!
    if (code === 0) {
      next = {}
    } else if (code === 1) {
      next.bold = true
    } else if (code === 3) {
      next.italic = true
    } else if (code === 4) {
      next.underline = true
    } else if (code === 22) {
      next.bold = false
    } else if (code === 23) {
      next.italic = false
    } else if (code === 24) {
      next.underline = false
    } else if (code === 39) {
      delete next.color
    } else if (code === 49) {
      delete next.background
    } else if (FG_COLORS[code]) {
      next.color = FG_COLORS[code]
    } else if (BG_COLORS[code]) {
      next.background = BG_COLORS[code]
    } else if (code === 38 || code === 48) {
      // 256-цвет (38;5;n) или truecolor (38;2;r;g;b) — пропускаем параметры
      const isFg = code === 38
      const mode = codes[i + 1]
      if (mode === 5) {
        i += 2
      } else if (mode === 2) {
        const r = codes[i + 2] ?? 0
        const g = codes[i + 3] ?? 0
        const b = codes[i + 4] ?? 0
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
        if (isFg) next.color = hex
        else next.background = hex
        i += 4
      }
    }
  }
  return next
}

/** Разбирает строку с ANSI-кодами на стилизованные сегменты. */
export function parseAnsi(input: string): AnsiSegment[] {
  const segments: AnsiSegment[] = []
  let style: AnsiStyle = {}
  let lastIndex = 0
  let match: RegExpExecArray | null

  ANSI_PATTERN.lastIndex = 0
  while ((match = ANSI_PATTERN.exec(input)) !== null) {
    if (match.index > lastIndex) {
      const text = input.slice(lastIndex, match.index)
      if (text) segments.push({ text, ...style })
    }
    const codes = match[1]!
      .split(';')
      .filter((s) => s.length > 0)
      .map((s) => Number(s))
    // Пустой код (ESC[m) эквивалентен сбросу.
    style = applyCodes(style, codes.length ? codes : [0])
    lastIndex = ANSI_PATTERN.lastIndex
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), ...style })
  }

  return segments
}
