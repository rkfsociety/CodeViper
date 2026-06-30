export interface WebhookPayload {
  chatId: string
  projectPath: string
  summary: string
  durationMs: number
}

/** Discord embed webhook body (https://discord.com/developers/docs/resources/webhook#execute-webhook) */
export interface DiscordWebhookBody {
  embeds: Array<{
    title: string
    description: string
    color: number
    fields: Array<{ name: string; value: string; inline?: boolean }>
    timestamp: string
  }>
}

const DISCORD_EMBED_COLOR_READY = 0x57f287
const DISCORD_FIELD_MAX = 1024
const DISCORD_DESCRIPTION_MAX = 4096
const TELEGRAM_TEXT_MAX = 4096

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text
  return `${text.slice(0, max - 1)}…`
}

function truncateForDiscord(text: string, max: number): string {
  return truncateText(text, max)
}

function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function formatDurationMs(durationMs: number): string {
  const sec = Math.max(0, Math.round(durationMs / 1000))
  if (sec < 60) return `${sec} с`
  const min = Math.floor(sec / 60)
  const rem = sec % 60
  return rem > 0 ? `${min} мин ${rem} с` : `${min} мин`
}

export function buildDiscordWebhookBody(payload: WebhookPayload): DiscordWebhookBody {
  const chatLabel = payload.chatId.trim() || '—'
  return {
    embeds: [
      {
        title: 'Агент готов',
        description: truncateForDiscord(payload.summary.trim() || '—', DISCORD_DESCRIPTION_MAX),
        color: DISCORD_EMBED_COLOR_READY,
        fields: [
          {
            name: 'Проект',
            value: truncateForDiscord(payload.projectPath.trim() || '—', DISCORD_FIELD_MAX),
            inline: false
          },
          { name: 'Чат', value: truncateForDiscord(chatLabel, DISCORD_FIELD_MAX), inline: true },
          {
            name: 'Время',
            value: formatDurationMs(payload.durationMs),
            inline: true
          }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  }
}

/** Telegram Bot API sendMessage body (https://core.telegram.org/bots/api#sendmessage) */
export interface TelegramSendMessageBody {
  chat_id: string
  text: string
  parse_mode: 'HTML'
}

export function buildTelegramMessage(payload: WebhookPayload): string {
  const chatLabel = payload.chatId.trim() || '—'
  const summary = escapeTelegramHtml(truncateText(payload.summary.trim() || '—', TELEGRAM_TEXT_MAX))
  const project = escapeTelegramHtml(truncateText(payload.projectPath.trim() || '—', 512))
  const duration = escapeTelegramHtml(formatDurationMs(payload.durationMs))
  const chat = escapeTelegramHtml(truncateText(chatLabel, 128))

  return truncateText(
    [
      '<b>Агент готов</b>',
      '',
      summary,
      '',
      `<b>Проект:</b> ${project}`,
      `<b>Чат:</b> ${chat}`,
      `<b>Время:</b> ${duration}`
    ].join('\n'),
    TELEGRAM_TEXT_MAX
  )
}

export function buildTelegramSendMessageBody(
  chatId: string,
  payload: WebhookPayload
): TelegramSendMessageBody {
  return {
    chat_id: chatId.trim(),
    text: buildTelegramMessage(payload),
    parse_mode: 'HTML'
  }
}

export async function notifyTelegram(
  botToken: string,
  chatId: string,
  payload: WebhookPayload
): Promise<void> {
  if (!botToken.trim() || !chatId.trim()) return
  try {
    const url = `https://api.telegram.org/bot${botToken.trim()}/sendMessage`
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildTelegramSendMessageBody(chatId, payload)),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    // best-effort — не прерывать агента из-за недоступного Telegram API
  }
}

export async function notifyWebhook(url: string, payload: WebhookPayload): Promise<void> {
  if (!url.trim()) return
  try {
    await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    // best-effort — не прерывать агента из-за недоступного webhook
  }
}

export async function notifyDiscordWebhook(url: string, payload: WebhookPayload): Promise<void> {
  if (!url.trim()) return
  try {
    await fetch(url.trim(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildDiscordWebhookBody(payload)),
      signal: AbortSignal.timeout(10_000)
    })
  } catch {
    // best-effort — не прерывать агента из-за недоступного webhook
  }
}
