import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { tronStringify } from '../lib/tron'

export interface AgentLogEntry {
  ts?: string
  event: string
  [key: string]: unknown
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

class AgentLogger {
  private dir: string | null = null

  private logsDir(): string {
    if (!this.dir) {
      this.dir = join(app.getPath('userData'), 'logs')
    }
    return this.dir
  }

  private filePath(): string {
    return join(this.logsDir(), `agent-${dateStamp()}.ndjson`)
  }

  async write(entry: AgentLogEntry): Promise<void> {
    try {
      await mkdir(this.logsDir(), { recursive: true })
      const line = tronStringify({ ts: new Date().toISOString(), ...entry }) + '\n'
      await appendFile(this.filePath(), line, 'utf8')
    } catch {
      // логирование необязательно — не прерываем работу агента
    }
  }
}

export const agentLogger = new AgentLogger()
