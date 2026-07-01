export function parseToolArgs(args: Record<string, string> | string): Record<string, string> {
  if (typeof args === 'string') {
    try {
      return JSON.parse(args) as Record<string, string>
    } catch {
      return { _raw: args }
    }
  }
  return args
}
