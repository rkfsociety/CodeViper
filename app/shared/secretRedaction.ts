/** Плейсхолдер вместо секретов в логах, контексте и collective memory. */
export const SECRET_REDACTED = '***REDACTED***'

/** API-ключи, токены и похожие значения в произвольном тексте. */
const TOKEN_PATTERNS: RegExp[] = [
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{4,}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{4,}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bASIA[0-9A-Z]{16}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g
]

const SENSITIVE_ENV_KEY =
  /(?:^|_)(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD|PRIVATE|AUTH|CREDENTIAL)(?:$|_)/i

function isSensitiveEnvKey(key: string): boolean {
  return SENSITIVE_ENV_KEY.test(key)
}

function containsEmbeddedSecret(value: string): boolean {
  for (const pattern of TOKEN_PATTERNS) {
    pattern.lastIndex = 0
    if (pattern.test(value)) return true
  }
  return false
}

/** Маскирует секреты в строке (sk-…, ghp_…, AWS keys, чувствительные KEY=value). */
export function redactSecrets(text: string): string {
  if (!text) return text

  let result = text
  for (const pattern of TOKEN_PATTERNS) {
    result = result.replace(pattern, SECRET_REDACTED)
  }

  result = result.replace(
    /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/gm,
    (line, key: string, value: string) => {
      if (isSensitiveEnvKey(key) || containsEmbeddedSecret(value)) {
        return `${key}=${SECRET_REDACTED}`
      }
      return line
    }
  )

  return result
}

/** Рекурсивно маскирует строки в объектах (для NDJSON-логов). */
export function redactSecretsDeep(value: unknown): unknown {
  if (typeof value === 'string') return redactSecrets(value)
  if (Array.isArray(value)) return value.map((item) => redactSecretsDeep(item))
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactSecretsDeep(nested)
    }
    return out
  }
  return value
}

export interface RedactableMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
}

/** Маскирует content и arguments tool_calls перед отправкой провайдеру. */
export function redactMessagesForModel<T extends RedactableMessage>(messages: T[]): T[] {
  return messages.map((message) => ({
    ...message,
    content: redactSecrets(message.content),
    ...(message.tool_calls
      ? {
          tool_calls: message.tool_calls.map((call) => ({
            ...call,
            function: {
              ...call.function,
              arguments: redactSecrets(call.function.arguments)
            }
          }))
        }
      : {})
  }))
}
