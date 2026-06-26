import type { AgentStreamPayload, AgentTraceEvent } from '../../src/types'
import { emitAgentTrace } from './agentTrace'

export class ResponseEmitter {
  constructor(
    private readonly _emit: (event: AgentStreamPayload) => void,
    private readonly signal?: AbortSignal
  ) {}

  get abortSignal(): AbortSignal | undefined {
    return this.signal
  }

  throwIfAborted(): void {
    if (this.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  }

  handleAbort(): void {
    this._emit({ type: 'error', content: 'Остановлено пользователем' })
    this._emit({ type: 'done' })
  }

  trace(kind: AgentTraceEvent['kind'], label: string, data: Record<string, unknown>): void {
    emitAgentTrace(this._emit, kind, label, data)
  }

  emit(event: AgentStreamPayload): void {
    this._emit(event)
  }
}
