import type { ToolHandlers } from './agentTools'

const DEFAULT_TIMEOUT_MS = 15_000
const DDG_LITE_URL = 'https://lite.duckduckgo.com/lite/'

/** Убрать HTML-теги и декодировать сущности */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Извлечь href из <a href="..."> */
function extractHref(tag: string): string {
  const m = tag.match(/href=["']([^"']+)["']/i)
  return m ? m[1] : ''
}

/**
 * Парсим lite.duckduckgo.com — таблица с результатами.
 * Структура: строки <tr> с классами result-link / result-snippet.
 */
function parseDDGLite(
  html: string,
  maxResults: number
): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = []

  // Каждый результат — пара строк:
  // <td class="result-link"><a href="...">Title</a></td>
  // <td class="result-snippet">Snippet text</td>
  const linkRe = /<td[^>]*class="result-link"[^>]*>([\s\S]*?)<\/td>/gi
  const snippetRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi

  const links: Array<{ title: string; url: string }> = []
  let m: RegExpExecArray | null

  while ((m = linkRe.exec(html)) !== null && links.length < maxResults) {
    const cell = m[1]
    const aMatch = cell.match(/<a([^>]*)>([\s\S]*?)<\/a>/i)
    if (!aMatch) continue
    const href = extractHref(aMatch[1])
    const title = htmlToText(aMatch[2])
    if (href && title) links.push({ title, url: href })
  }

  const snippets: string[] = []
  while ((m = snippetRe.exec(html)) !== null && snippets.length < maxResults) {
    snippets.push(htmlToText(m[1]))
  }

  for (let i = 0; i < links.length; i++) {
    results.push({ ...links[i], snippet: snippets[i] ?? '' })
  }

  return results
}

async function searchDDG(query: string, maxResults: number): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

  try {
    const response = await fetch(DDG_LITE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      body: `q=${encodeURIComponent(query)}&kl=ru-ru`
    })

    const html = await response.text()
    const results = parseDDGLite(html, maxResults)

    if (results.length === 0) {
      return `По запросу «${query}» ничего не найдено. Попробуй web_fetch с конкретным URL.`
    }

    return results
      .map((r, i) => {
        const lines = [`${i + 1}. ${r.title}`, `   ${r.url}`]
        if (r.snippet) lines.push(`   ${r.snippet}`)
        return lines.join('\n')
      })
      .join('\n\n')
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return `Таймаут поиска (${DEFAULT_TIMEOUT_MS / 1000} с)`
    }
    return `Ошибка поиска: ${err instanceof Error ? err.message : String(err)}`
  } finally {
    clearTimeout(timer)
  }
}

export function createWebToolHandlers(): Partial<ToolHandlers> {
  const handlers: Partial<ToolHandlers> = {
    async web_fetch(args: any) {
      const url = args.url
      const maxChars = args.max_chars ?? 20_000

      if (!url.trim()) return 'Не указан URL'

      let parsedUrl: URL
      try {
        parsedUrl = new URL(url)
      } catch {
        return `Некорректный URL: ${url}`
      }

      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return `Поддерживаются только HTTP/HTTPS URL. Получен: ${parsedUrl.protocol}`
      }

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        })

        const contentType = response.headers.get('content-type') ?? ''
        const raw = await response.text()

        const text = contentType.includes('text/html') ? htmlToText(raw) : raw
        const truncated =
          text.length > maxChars ? text.slice(0, maxChars) + '\n...[обрезано]' : text

        return `URL: ${url}\nСтатус: ${response.status}\n\n${truncated}`
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return `Таймаут запроса (${DEFAULT_TIMEOUT_MS / 1000} с): ${url}`
        }
        return `Ошибка при загрузке ${url}: ${err instanceof Error ? err.message : String(err)}`
      } finally {
        clearTimeout(timer)
      }
    },

    async web_search(args: any) {
      const query = args.query
      const maxResults = args.max_results ?? 5

      if (!query.trim()) return 'Не указан поисковый запрос'

      return searchDDG(query, maxResults)
    }
  }
  return handlers
}
