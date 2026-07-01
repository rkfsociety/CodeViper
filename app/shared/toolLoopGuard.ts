import { parseReadMultiplePaths } from './readMultiplePaths'

/** Нормализация подписи tool call для LoopGuard: read_* с одним path не дублируются из‑за offset/limit. */
export function normalizeToolLoopSignature(
  name: string,
  args: Record<string, string | unknown>
): string {
  if (name === 'read_file' || name === 'file_info') {
    return `${name}:${String(args.path ?? '').trim()}`
  }
  if (name === 'read_multiple_files') {
    const paths = parseReadMultiplePaths(args.paths)
    return `${name}:${[...new Set(paths)].sort().join('|')}`
  }
  return `${name}:${JSON.stringify(args)}`
}
