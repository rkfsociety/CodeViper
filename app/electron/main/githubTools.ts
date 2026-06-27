import { spawn } from 'child_process'
import { getCodeViperSourceRoot } from './codeviperSource'
import { prependWindowsCliToolsToPath } from './windowsGitEnv'

export interface GhResult {
  code: number
  stdout: string
  stderr: string
}

function runGh(args: string[]): Promise<GhResult> {
  return new Promise((resolve) => {
    const child = spawn('gh', args, {
      cwd: getCodeViperSourceRoot(),
      windowsHide: true,
      env: prependWindowsCliToolsToPath(process.env)
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
