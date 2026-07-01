import { readFile, stat } from 'fs/promises'
import { join, resolve } from 'path'

type IndexParamScope = 'settings' | 'static'

type IndexParamIssue = {
  scope: IndexParamScope
  file: string
  message: string
}

const CHUNK_MIN = 256
const CHUNK_MAX = 8192
const BATCH_MIN = 1
const BATCH_MAX = 128

const SETTINGS_CANDIDATES = [
  'app/electron/main/settings.ts',
  'electron/main/settings.ts',
  'settings.ts'
]

const RAG_CANDIDATES = [
  'app/electron/main/rag.ts',
  'app/electron/main/contextRAG.ts',
  'app/electron/main/embeddingQueue.ts',
  'rag.ts',
  'contextRAG.ts',
  'embeddingQueue.ts'
]

async function readFirstExistingFile(
  projectPath: string,
  candidates: string[]
): Promise<{ file: string; source: string } | null> {
  for (const candidate of candidates) {
    const abs = resolve(projectPath, candidate)
    try {
      const info = await stat(abs)
      if (!info.isFile()) continue
      return { file: abs, source: await readFile(abs, 'utf8') }
    } catch {
      /* ignore */
    }
  }

  return null
}

async function readExistingFiles(
  projectPath: string,
  candidates: string[]
): Promise<Array<{ file: string; source: string }>> {
  const seen = new Set<string>()
  const files: Array<{ file: string; source: string }> = []

  for (const candidate of candidates) {
    const abs = resolve(projectPath, candidate)
    if (seen.has(abs)) continue
    seen.add(abs)
    try {
      const info = await stat(abs)
      if (!info.isFile()) continue
      files.push({ file: abs, source: await readFile(abs, 'utf8') })
    } catch {
      /* ignore */
    }
  }

  return files
}

function extractConstNumber(source: string, names: string[]): number | null {
  for (const name of names) {
    const match = source.match(
      new RegExp(String.raw`(?:export\s+)?(?:const|let|var)\s+${name}\s*=\s*(\d+)\b`)
    )
    if (match) return Number(match[1])
  }
  return null
}

function extractBound(line: string, method: 'min' | 'max'): number | null {
  const match = line.match(new RegExp(String.raw`\.${method}\s*\(\s*(\d+)\s*\)`))
  return match ? Number(match[1]) : null
}

function collectSettingsIssues(file: string, source: string): IndexParamIssue[] {
  const issues: IndexParamIssue[] = []
  const lines = source.split(/\r?\n/)

  for (const line of lines) {
    const fieldMatch = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*z\.number\s*\(\s*\)/)
    if (!fieldMatch) continue

    const fieldName = fieldMatch[1]!.toLowerCase()
    if (fieldName.includes('chunk')) {
      const min = extractBound(line, 'min')
      const max = extractBound(line, 'max')
      if (min !== CHUNK_MIN || max !== CHUNK_MAX) {
        issues.push({
          scope: 'settings',
          file,
          message: `Zod bounds для chunk должны быть .min(${CHUNK_MIN}).max(${CHUNK_MAX}), найдено: ${line.trim()}`
        })
      }
      continue
    }

    if (fieldName.includes('overlap')) {
      const min = extractBound(line, 'min')
      const max = extractBound(line, 'max')
      const hasRelationCheck = /\.refine\s*\(|\.superRefine\s*\(|\b(?:lt|lessThan)\s*\(/i.test(line)
      if (min == null || min < 0 || max == null || !hasRelationCheck) {
        issues.push({
          scope: 'settings',
          file,
          message: 'Zod bounds для overlap должны ограничивать значение и проверять overlap < chunk'
        })
      }
      continue
    }

    if (fieldName.includes('batch')) {
      const min = extractBound(line, 'min')
      const max = extractBound(line, 'max')
      if (min == null || min < BATCH_MIN || (max != null && max > BATCH_MAX)) {
        issues.push({
          scope: 'settings',
          file,
          message: `Zod bounds для batch должны быть в диапазоне ${BATCH_MIN}-${BATCH_MAX}`
        })
      }
    }
  }

  return issues
}

function collectStaticIssues(file: string, source: string): IndexParamIssue[] {
  const issues: IndexParamIssue[] = []
  const chunk = extractConstNumber(source, [
    'AUTO_INDEX_CHUNK_LINES',
    'CHUNK_LINES',
    'INDEX_CHUNK_LINES',
    'CHUNK_SIZE'
  ])
  const overlap = extractConstNumber(source, [
    'AUTO_INDEX_OVERLAP_LINES',
    'OVERLAP_LINES',
    'CHUNK_OVERLAP_LINES'
  ])
  const batch = extractConstNumber(source, ['BATCH_SIZE', 'INDEX_BATCH_SIZE', 'EMBED_BATCH_SIZE'])

  if (chunk != null && (chunk < CHUNK_MIN || chunk > CHUNK_MAX)) {
    issues.push({
      scope: 'static',
      file,
      message: `chunk=${chunk} вне диапазона ${CHUNK_MIN}-${CHUNK_MAX}`
    })
  }

  if (overlap != null) {
    if (overlap < 0) {
      issues.push({
        scope: 'static',
        file,
        message: `overlap=${overlap} не может быть отрицательным`
      })
    } else if (chunk != null && overlap >= chunk) {
      issues.push({
        scope: 'static',
        file,
        message: `overlap=${overlap} должен быть меньше chunk=${chunk}`
      })
    }
  }

  if (batch != null && (batch < BATCH_MIN || batch > BATCH_MAX)) {
    issues.push({
      scope: 'static',
      file,
      message: `batch=${batch} вне диапазона ${BATCH_MIN}-${BATCH_MAX}`
    })
  }

  return issues
}

function formatIssues(issues: IndexParamIssue[]): string {
  if (!issues.length) return 'find_index_param_issues(): индексные параметры не нарушены.'

  return [
    `find_index_param_issues(): найдено ${issues.length} проблем index parameters:`,
    ...issues.map(
      (issue, index) => `[${index + 1}] [${issue.scope}] ${issue.file}\n    ${issue.message}`
    )
  ].join('\n')
}

export async function findIndexParamIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const scopedSettingsCandidates = options.path?.trim()
    ? [options.path.trim(), join(options.path.trim(), 'settings.ts'), ...SETTINGS_CANDIDATES]
    : SETTINGS_CANDIDATES
  const scopedRagCandidates = options.path?.trim()
    ? [
        options.path.trim(),
        join(options.path.trim(), 'rag.ts'),
        join(options.path.trim(), 'contextRAG.ts'),
        join(options.path.trim(), 'embeddingQueue.ts'),
        ...RAG_CANDIDATES
      ]
    : RAG_CANDIDATES

  const settings = await readFirstExistingFile(projectPath, scopedSettingsCandidates)
  const ragFiles = await readExistingFiles(projectPath, scopedRagCandidates)

  const issues: IndexParamIssue[] = []
  if (settings) issues.push(...collectSettingsIssues(settings.file, settings.source))
  for (const ragFile of ragFiles) {
    issues.push(...collectStaticIssues(ragFile.file, ragFile.source))
  }

  if (!settings && !ragFiles.length) {
    return 'indexParamAnalysis: settings.ts / rag.ts не найдены.'
  }

  return formatIssues(issues)
}
