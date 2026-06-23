import { describe, expect, it } from 'vitest'
import {
  SECRET_REDACTED,
  redactSecrets,
  redactSecretsDeep,
  redactMessagesForModel
} from '../shared/secretRedaction'

describe('secretRedaction', () => {
  it('маскирует sk-test в строке', () => {
    expect(redactSecrets('ключ sk-test в тексте')).toBe(`ключ ${SECRET_REDACTED} в тексте`)
  })

  it('маскирует GitHub token ghp_', () => {
    expect(redactSecrets('token ghp_1234567890abcdefghijklmnopqrstuvwxyz')).toBe(
      `token ${SECRET_REDACTED}`
    )
  })

  it('маскирует AWS access key', () => {
    expect(redactSecrets('AKIAIOSFODNN7EXAMPLE')).toBe(SECRET_REDACTED)
  })

  it('маскирует чувствительные .env KEY=value', () => {
    expect(redactSecrets('OPENAI_API_KEY=sk-live-secret-value')).toBe(
      `OPENAI_API_KEY=${SECRET_REDACTED}`
    )
    expect(redactSecrets('DB_PASSWORD=hunter2')).toBe(`DB_PASSWORD=${SECRET_REDACTED}`)
  })

  it('не трогает безобидные переменные окружения', () => {
    expect(redactSecrets('NODE_ENV=development')).toBe('NODE_ENV=development')
  })

  it('redactSecretsDeep маскирует вложенные поля лога', () => {
    const redacted = redactSecretsDeep({
      event: 'tool_call',
      args: { apiKey: 'sk-test' },
      output: 'used sk-test here'
    }) as Record<string, unknown>
    expect((redacted.args as Record<string, string>).apiKey).toBe(SECRET_REDACTED)
    expect(redacted.output).toBe(`used ${SECRET_REDACTED} here`)
  })

  it('redactMessagesForModel маскирует content сообщений', () => {
    const messages = redactMessagesForModel([
      { role: 'user', content: 'проверка sk-test' },
      { role: 'tool', content: 'API_KEY=sk-test' }
    ])
    expect(messages[0]?.content).toBe(`проверка ${SECRET_REDACTED}`)
    expect(messages[1]?.content).toBe(`API_KEY=${SECRET_REDACTED}`)
  })
})
