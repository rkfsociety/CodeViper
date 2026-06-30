import { describe, it, expect, vi } from 'vitest'
import {
  buildDiscordWebhookBody,
  buildTelegramMessage,
  buildTelegramSendMessageBody,
  notifyTelegram
} from '../electron/main/webhookNotify'

describe('buildDiscordWebhookBody', () => {
  it('формирует Discord embed с полями проекта, чата и длительности', () => {
    const body = buildDiscordWebhookBody({
      chatId: 'chat-42',
      projectPath: 'F:\\repo\\CodeViper',
      summary: 'Рефакторинг завершён.',
      durationMs: 125_000
    })

    expect(body.embeds).toHaveLength(1)
    const embed = body.embeds[0]
    expect(embed.title).toBe('Агент готов')
    expect(embed.description).toBe('Рефакторинг завершён.')
    expect(embed.color).toBe(0x57f287)
    expect(embed.fields).toEqual([
      { name: 'Проект', value: 'F:\\repo\\CodeViper', inline: false },
      { name: 'Чат', value: 'chat-42', inline: true },
      { name: 'Время', value: '2 мин 5 с', inline: true }
    ])
    expect(embed.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('обрезает длинный summary и подставляет плейсхолдеры для пустых полей', () => {
    const longSummary = 'x'.repeat(5000)
    const body = buildDiscordWebhookBody({
      chatId: '',
      projectPath: '',
      summary: longSummary,
      durationMs: 800
    })

    const embed = body.embeds[0]
    expect(embed.description).toHaveLength(4096)
    expect(embed.description.endsWith('…')).toBe(true)
    expect(embed.fields[0].value).toBe('—')
    expect(embed.fields[1].value).toBe('—')
    expect(embed.fields[2].value).toBe('1 с')
  })
})

describe('buildTelegramMessage', () => {
  it('формирует HTML-сообщение с проектом, чатом и длительностью', () => {
    const text = buildTelegramMessage({
      chatId: 'chat-42',
      projectPath: 'F:\\repo\\CodeViper',
      summary: 'Рефакторинг завершён.',
      durationMs: 125_000
    })

    expect(text).toContain('<b>Агент готов</b>')
    expect(text).toContain('Рефакторинг завершён.')
    expect(text).toContain('<b>Проект:</b> F:\\repo\\CodeViper')
    expect(text).toContain('<b>Чат:</b> chat-42')
    expect(text).toContain('<b>Время:</b> 2 мин 5 с')
  })

  it('экранирует HTML и подставляет плейсхолдеры для пустых полей', () => {
    const text = buildTelegramMessage({
      chatId: '',
      projectPath: '',
      summary: '<script>alert(1)</script>',
      durationMs: 800
    })

    expect(text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(text).toContain('<b>Проект:</b> —')
    expect(text).toContain('<b>Чат:</b> —')
    expect(text).toContain('<b>Время:</b> 1 с')
  })
})

describe('notifyTelegram', () => {
  const payload = {
    chatId: 'chat-1',
    projectPath: 'C:\\proj',
    summary: 'Готово.',
    durationMs: 3000
  }

  it('вызывает Telegram sendMessage API с токеном и chat_id', async () => {
    const originalFetch = global.fetch
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{"ok":true}', { status: 200 })
    )
    global.fetch = fetchMock as typeof fetch

    await notifyTelegram('bot-token-123', '-100999', payload)

    expect(fetchMock).toHaveBeenCalledOnce()
    const call = fetchMock.mock.calls[0]
    expect(call?.[0]).toBe('https://api.telegram.org/botbot-token-123/sendMessage')
    const init = call?.[1]
    expect(init?.method).toBe('POST')
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' })
    expect(JSON.parse(String(init?.body))).toEqual(buildTelegramSendMessageBody('-100999', payload))

    global.fetch = originalFetch
  })

  it('не вызывает fetch при пустом токене или chat_id', async () => {
    const originalFetch = global.fetch
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response('{"ok":true}', { status: 200 })
    )
    global.fetch = fetchMock as typeof fetch

    await notifyTelegram('', '-100999', payload)
    await notifyTelegram('token', '  ', payload)

    expect(fetchMock).not.toHaveBeenCalled()
    global.fetch = originalFetch
  })
})
