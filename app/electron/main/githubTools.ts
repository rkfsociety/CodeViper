import { spawn } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { getCodeViperSourceRoot } from './codeviperSource'
import { ghSpawnEnv, resolveGhExecutable } from './windowsGitEnv'

export interface GhResult {
  code: number
  stdout: string
  stderr: string
}

export interface GhStructuredResult {
  ok: boolean
  url?: string
  error?: string
}

type GhRunner = (args: string[]) => Promise<GhResult>

let ghRunnerOverride: GhRunner | null = null

/** Только для unit-тестов — подмена вызовов gh. */
export function setGhRunnerForTests(runner: GhRunner | null): void {
  ghRunnerOverride = runner
}

function runGh(args: string[]): Promise<GhResult> {
  if (ghRunnerOverride) return ghRunnerOverride(args)

  const ghBin = resolveGhExecutable()
  return new Promise((resolve) => {
    const child = spawn(ghBin, args, {
      cwd: getCodeViperSourceRoot(),
      windowsHide: true,
      env: ghSpawnEnv(process.env)
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (c: Buffer) => (stdout += c.toString()))
    child.stderr?.on('data', (c: Buffer) => (stderr += c.toString()))
    child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }))
    child.on('error', (err) => resolve({ code: 127, stdout: '', stderr: err.message }))
  })
}

function formatGhResult(result: GhResult): string {
  return [
    `exit: ${result.code}`,
    result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : '',
    result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function parseGhUrl(output: string): string | undefined {
  const match = output.trim().match(/https:\/\/(?:gist\.)?github\.com\/\S+/)
  return match?.[0]
}

function ghFailureMessage(result: GhResult, action: string): string {
  const detail = result.stderr.trim() || result.stdout.trim()
  return detail ? `${action}: ${detail}` : `${action}: exit ${result.code}`
}

/** Проверяет, что gh установлен и авторизован. */
export async function ensureGhReady(): Promise<string | null> {
  const version = await runGh(['--version'])
  if (version.code !== 0) {
    return 'GitHub CLI (gh) не установлен. Установите с https://cli.github.com и выполните gh auth login.'
  }

  const status = await runGh(['auth', 'status'])
  if (status.code !== 0) {
    return 'GitHub CLI не авторизован. Выполните в терминале: gh auth login'
  }

  return null
}

export async function getGhLogin(): Promise<string | undefined> {
  const ready = await ensureGhReady()
  if (ready) return undefined

  const result = await runGh(['api', 'user', '-q', '.login'])
  if (result.code !== 0) return undefined
  const login = result.stdout.trim()
  return login || undefined
}

export async function createGistViaGh(
  files: Record<string, string>,
  description: string
): Promise<GhStructuredResult> {
  const authErr = await ensureGhReady()
  if (authErr) return { ok: false, error: authErr }

  const tmpDir = await mkdtemp(join(tmpdir(), 'cv-gist-'))
  try {
    const paths: string[] = []
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(tmpDir, name)
      await writeFile(filePath, content, 'utf8')
      paths.push(filePath)
    }

    const result = await runGh(['gist', 'create', ...paths, '-d', description])
    if (result.code !== 0) {
      return { ok: false, error: ghFailureMessage(result, 'gh gist create') }
    }

    const url = parseGhUrl(result.stdout)
    if (!url) {
      return { ok: false, error: 'gh gist create: URL не найден в выводе' }
    }

    return { ok: true, url }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

export async function createIssueViaGh(
  title: string,
  body: string,
  options?: { labels?: string[]; repo?: string }
): Promise<GhStructuredResult> {
  const authErr = await ensureGhReady()
  if (authErr) return { ok: false, error: authErr }

  const tmpDir = await mkdtemp(join(tmpdir(), 'cv-issue-'))
  try {
    const bodyFile = join(tmpDir, 'body.md')
    await writeFile(bodyFile, body, 'utf8')

    const args = ['issue', 'create', '-t', title, '-F', bodyFile]
    if (options?.repo?.trim()) args.push('-R', options.repo.trim())
    if (options?.labels?.length) {
      for (const label of options.labels) {
        if (label.trim()) args.push('-l', label.trim())
      }
    }

    const result = await runGh(args)
    if (result.code !== 0) {
      return { ok: false, error: ghFailureMessage(result, 'gh issue create') }
    }

    const url = parseGhUrl(result.stdout)
    if (!url) {
      return { ok: false, error: 'gh issue create: URL не найден в выводе' }
    }

    return { ok: true, url }
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
  }
}

function validateWorkflowRef(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed) return 'Пустой workflow'
  if (trimmed.length > 120) return 'workflow слишком длинный'
  if (!/^[\w./@:-]+$/.test(trimmed)) return 'Недопустимый workflow'
  return null
}

export async function createIssue(title: string, body?: string, labels?: string): Promise<string> {
  const args = ['issue', 'create', '--title', title]
  if (body?.trim()) args.push('--body', body)
  if (labels?.trim()) args.push('--label', labels)
  const result = await runGh(args)
  return formatGhResult(result)
}

export async function createPr(title?: string, body?: string): Promise<string> {
  const args = ['pr', 'create']
  if (title?.trim()) args.push('--title', title)
  if (body?.trim()) args.push('--body', body)
  const result = await runGh(args)
  return formatGhResult(result)
}

export async function listIssues(): Promise<string> {
  const result = await runGh(['issue', 'list', '--limit', '30', '--json', 'number,title,state,url'])
  return formatGhResult(result)
}

export async function openIssue(number: string): Promise<string> {
  const trimmed = number.trim()
  if (!trimmed) return 'Пустой номер issue'
  if (!/^\d+$/.test(trimmed)) return 'Номер issue должен быть числом'
  const result = await runGh(['issue', 'view', trimmed, '--web'])
  return formatGhResult(result)
}

export async function triggerGithubWorkflow(
  workflowId: string,
  ref?: string,
  fields?: string
): Promise<string> {
  const refError = validateWorkflowRef(workflowId)
  if (refError) return refError
  const args = ['workflow', 'run', workflowId]
  if (ref?.trim()) args.push('--ref', ref.trim())
  if (fields?.trim()) args.push('--field', fields)
  const result = await runGh(args)
  return formatGhResult(result)
}
