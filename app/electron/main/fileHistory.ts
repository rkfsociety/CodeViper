import { appendFile, mkdir, readFile } from 'fs/promises'
import { existsSync, readdirSync } from 'fs'
import { join, normalize } from 'path'
import { app } from 'electron'

export interface FileHistoryEntry {
  ts: string
  tool: 'edit_file' | 'write_file' | 'create_file' | 'append_file' | 'delete_file' | 'move_file'
  path: string
  projectPath: string
  diff: string
}

function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

export async function appendFileHistory(entry: Omit<FileHistoryEntry, 'ts'>): Promise<void> {
  try {
    const dir = logsDir()
    await mkdir(dir, { recursive: true })
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n'
    await appendFile(join(dir, `file-history-${dateStamp()}.ndjson`), line, 'utf8')
  } catch {
    // лог необязателен
  }
}

/** Читает все лог-файлы и возвращает записи для указанного файла проекта. */
export async function readFileHistory(
  projectPath: string,
  filePath: string
): Promise<FileHistoryEntry[]> {
  const dir = logsDir()
  if (!existsSync(dir)) return []

  const normProject = normalize(projectPath)
  const normFile = normalize(filePath).replace(/\\/g, '/')

  const files = readdirSync(dir)
    .filter((f) => f.startsWith('file-history-') && f.endsWith('.ndjson'))
    .sort()

  const entries: FileHistoryEntry[] = []

  for (const file of files) {
    let raw = ''
    try {
      raw = await readFile(join(dir, file), 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const entry = JSON.parse(trimmed) as FileHistoryEntry
        if (normalize(entry.projectPath) !== normProject) continue
        if (normalize(entry.path).replace(/\\/g, '/') !== normFile) continue
        entries.push(entry)
      } catch {
        // skip malformed
      }
    }
  }

  return entries
}
