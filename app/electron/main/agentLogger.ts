import { appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { tronStringify } from '../lib/tron'
import { redactSecretsDeep } from '../../shared/secretRedaction'

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
  private incognito = false

  setIncognito(flag: boolean): void {
    this.incognito = flag
  }

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
    if (this.incognito) return
    try {
      await mkdir(this.logsDir(), { recursive: true })
      const line =
        tronStringify(redactSecretsDeep({ ts: new Date().toISOString(), ...entry })) + '\n'
      await appendFile(this.filePath(), line, 'utf8')
    } catch {
      // логирование необязательно — не прерываем работу агента
    }
  }
}

export const agentLogger = new AgentLogger()
