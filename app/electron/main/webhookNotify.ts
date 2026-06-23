export interface WebhookPayload {
  chatId: string
  projectPath: string
  summary: string
  durationMs: number
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
