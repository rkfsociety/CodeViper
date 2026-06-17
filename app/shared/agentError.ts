/** Типизированная ошибка агента с кодом для различения причин сбоя. */
export class AgentError extends Error {
  constructor(
    message: string,
    /** Машиночитаемый код причины */
    public readonly code:
      | 'timeout'
      | 'no_model'
      | 'prerequisites'
      | 'run_failed'
      | 'stream_lost'
      | 'readonly'
      | string = 'run_failed'
  ) {
    super(message)
    this.name = 'AgentError'
  }
}
