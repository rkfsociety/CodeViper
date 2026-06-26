/** Нормализация подписи tool call для LoopGuard: read_* с одним path не дублируются из‑за offset/limit. */
export function normalizeToolLoopSignature(name: string, args: Record<string, string>): string {
  if (name === 'read_file' || name === 'read_codeviper_file' || name === 'file_info') {
    return `${name}:${(args.path ?? '').trim()}`
  }
  if (name === 'read_multiple_files') {
    let paths: string[] = []
    try {
      const parsed = JSON.parse(args.paths ?? '[]') as unknown
      if (Array.isArray(parsed)) paths = parsed.map((p) => String(p).trim()).filter(Boolean)
    } catch {
      paths = (args.paths ?? '')
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    }
    return `${name}:${[...new Set(paths)].sort().join('|')}`
  }
  return `${name}:${JSON.stringify(args)}`
}
