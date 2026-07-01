import { describe, expect, it } from 'vitest'
import { Contracts, IPC, parseIpcArgs } from '../shared/ipcContracts'

describe('AgentSettingsSchema IPC', () => {
  it('сохраняет telegram и webhook-поля при parseIpcArgs SAVE_SETTINGS', () => {
    const settings = {
      ollamaUrl: 'http://127.0.0.1:11434',
      model: '',
      telegramBotToken: 'bot-token-123',
      telegramChatId: '-100123',
      webhookUrl: 'https://hooks.example.com/slack',
      discordWebhookUrl: 'https://discord.com/api/webhooks/1/abc'
    }

    const [parsed] = parseIpcArgs(Contracts[IPC.SAVE_SETTINGS].args, [settings])

    expect(parsed.telegramBotToken).toBe('bot-token-123')
    expect(parsed.telegramChatId).toBe('-100123')
    expect(parsed.webhookUrl).toBe('https://hooks.example.com/slack')
    expect(parsed.discordWebhookUrl).toBe('https://discord.com/api/webhooks/1/abc')
  })
})
