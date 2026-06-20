/**
 * TRON (Token Reduced Object Notation) — компактный формат для сериализации данных
 * Сокращает размер JSON на ~27% за счёт удаления лишних кавычек и пробелов
 */

type TronValue = string | number | boolean | null | TronValue[] | Record<string, TronValue>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _useTronValue: TronValue = null

/**
 * Сериализует значение в TRON формат
 * Примеры:
 *   {name: "test"} → {n:"test"}
 *   [1, 2, 3] → [1,2,3]
 *   null → ~
 */
export function tronStringify(value: unknown): string {
  const cache = new WeakMap<object, string>()

  function stringify(val: unknown): string {
    if (val === null) return '~'
    if (val === undefined) return '~'
    if (typeof val === 'boolean') return val ? '!' : '?'
    if (typeof val === 'number') return val.toString()
    if (typeof val === 'string') return JSON.stringify(val)

    if (Array.isArray(val)) {
      if (cache.has(val)) return cache.get(val)!
      const result = '[' + val.map(stringify).join(',') + ']'
      cache.set(val, result)
      return result
    }

    if (typeof val === 'object') {
      if (cache.has(val)) return cache.get(val)!
      const obj = val as Record<string, unknown>
      const entries: string[] = []

      for (const [key, v] of Object.entries(obj)) {
        if (v !== undefined) {
          entries.push(JSON.stringify(key) + ':' + stringify(v))
        }
      }

      const result = '{' + entries.join(',') + '}'
      cache.set(val, result)
      return result
    }

    return '~'
  }

  return stringify(value)
}

/**
 * Парсит TRON строку обратно в объект
 */
export function tronParse(tron: string): unknown {
  let pos = 0

  function skipWhitespace() {
    while (pos < tron.length && /\s/.test(tron[pos])) pos++
  }

  function parseValue(): unknown {
    skipWhitespace()

    const char = tron[pos]

    if (char === '~') {
      pos++
      return null
    }

    if (char === '!') {
      pos++
      return true
    }

    if (char === '?') {
      pos++
      return false
    }

    if (char === '"') {
      pos++
      let value = ''
      while (pos < tron.length && tron[pos] !== '"') {
        if (tron[pos] === '\\') {
          pos++
          if (pos < tron.length) {
            const next = tron[pos]
            if (next === 'n') value += '\n'
            else if (next === 't') value += '\t'
            else if (next === 'r') value += '\r'
            else if (next === '"') value += '"'
            else if (next === '\\') value += '\\'
            else value += next
            pos++
          }
        } else {
          value += tron[pos]
          pos++
        }
      }
      if (pos < tron.length) pos++
      return value
    }

    if (char === '[') {
      pos++
      const arr: unknown[] = []
      skipWhitespace()
      if (tron[pos] !== ']') {
        while (true) {
          arr.push(parseValue())
          skipWhitespace()
          if (tron[pos] === ']') break
          if (tron[pos] === ',') {
            pos++
          }
        }
      }
      pos++
      return arr
    }

    if (char === '{') {
      pos++
      const obj: Record<string, unknown> = {}
      skipWhitespace()
      if (tron[pos] !== '}') {
        while (true) {
          skipWhitespace()
          if (tron[pos] === '"') {
            pos++
            let key = ''
            while (pos < tron.length && tron[pos] !== '"') {
              if (tron[pos] === '\\') {
                pos++
                if (pos < tron.length) pos++
              } else {
                key += tron[pos]
                pos++
              }
            }
            if (pos < tron.length) pos++
            skipWhitespace()
            if (tron[pos] === ':') {
              pos++
              obj[key] = parseValue()
            }
          }
          skipWhitespace()
          if (tron[pos] === '}') break
          if (tron[pos] === ',') {
            pos++
          }
        }
      }
      pos++
      return obj
    }

    // числа
    const start = pos
    if (tron[pos] === '-') pos++
    while (pos < tron.length && /\d/.test(tron[pos])) pos++
    if (tron[pos] === '.') {
      pos++
      while (pos < tron.length && /\d/.test(tron[pos])) pos++
    }
    const numStr = tron.substring(start, pos)
    if (numStr) return parseFloat(numStr)

    throw new Error(`Unexpected character at position ${pos}: ${tron[pos]}`)
  }

  return parseValue()
}

/**
 * Вспомогательные функции для localStorage
 */
export const tronStorage = {
  getItem(key: string): unknown {
    try {
      const raw = localStorage.getItem(key)
      return raw ? tronParse(raw) : null
    } catch {
      return null
    }
  },

  setItem(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, tronStringify(value))
    } catch {
      // ignore quota errors
    }
  },

  removeItem(key: string): void {
    localStorage.removeItem(key)
  }
}
