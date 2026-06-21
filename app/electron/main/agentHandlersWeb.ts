import type { ToolArgs, ToolHandlers } from './agentTools'

const DEFAULT_TIMEOUT_MS = 15_000

/** Обрезать HTML до читаемого текста — убираем теги и схлопываем пробелы */
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

export function createWebToolHandlers(): Partial<ToolHandlers> {
  return {
    async web_fetch(args: ToolArgs['web_fetch']) {
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
            'User-Agent': 'Mozilla/5.0 (compatible; CodeViper-Agent/1.0)'
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

    async web_search(args: ToolArgs['web_search']) {
      const query = args.query
      const maxResults = args.max_results ?? 5

      if (!query.trim()) return 'Не указан поисковый запрос'

      // DuckDuckGo Instant Answer API — бесплатно, без ключа
      const ddgUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_redirect=1&no_html=1`

      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS)

      try {
        const response = await fetch(ddgUrl, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; CodeViper-Agent/1.0)'
          }
        })

        const data = (await response.json()) as {
          AbstractText?: string
          AbstractURL?: string
          AbstractSource?: string
          Answer?: string
          RelatedTopics?: Array<{
            Text?: string
            FirstURL?: string
            Topics?: Array<{ Text?: string; FirstURL?: string }>
          }>
        }

        const lines: string[] = []

        if (data.Answer) {
          lines.push(`Ответ: ${data.Answer}`)
        }

        if (data.AbstractText) {
          lines.push(`${data.AbstractText}`)
          if (data.AbstractURL)
            lines.push(`Источник: ${data.AbstractURL} (${data.AbstractSource ?? ''})`)
        }

        const results: Array<{ text: string; url: string }> = []
        for (const topic of data.RelatedTopics ?? []) {
          if (results.length >= maxResults) break
          if (topic.Text && topic.FirstURL) {
            results.push({ text: topic.Text, url: topic.FirstURL })
          }
          // Вложенные группы тем
          for (const sub of topic.Topics ?? []) {
            if (results.length >= maxResults) break
            if (sub.Text && sub.FirstURL) {
              results.push({ text: sub.Text, url: sub.FirstURL })
            }
          }
        }

        if (results.length > 0) {
          lines.push('\nРезультаты:')
          results.forEach((r, i) => {
            lines.push(`${i + 1}. ${r.text}\n   ${r.url}`)
          })
        }

        if (lines.length === 0) {
          return `По запросу «${query}» ничего не найдено. Попробуй использовать web_fetch с конкретным URL.`
        }

        return lines.join('\n')
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          return `Таймаут поиска (${DEFAULT_TIMEOUT_MS / 1000} с)`
        }
        return `Ошибка поиска: ${err instanceof Error ? err.message : String(err)}`
      } finally {
        clearTimeout(timer)
      }
    }
  }
}
