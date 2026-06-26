import { mkdir, writeFile } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import type { AgentTraceEvent } from '../../src/types'

export function getAgentTracesDir(): string {
  return join(app.getPath('userData'), 'traces')
}

export async function exportAgentTrace(
  chatId: string,
  events: AgentTraceEvent[],
  projectPath?: string
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!chatId.trim()) {
    return { ok: false, error: 'Чат не выбран' }
  }
  try {
    const tracesDir = getAgentTracesDir()
    await mkdir(tracesDir, { recursive: true })
    const filePath = join(tracesDir, `${Date.now()}.json`)
    const payload = {
      chatId,
      ...(projectPath?.trim() ? { projectPath: projectPath.trim() } : {}),
      exportedAt: Date.now(),
      events
    }
    await writeFile(filePath, JSON.stringify(payload, null, 2), 'utf8')
    return { ok: true, path: filePath }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: message }
  }
}
