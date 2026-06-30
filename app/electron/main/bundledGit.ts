import { spawn } from 'child_process'
import { cliSpawnBase } from './windowsGitEnv'

export interface GitRunResult {
  code: number
  stdout: string
  stderr: string
}

type GitRunner = (cwd: string, args: string[]) => Promise<GitRunResult>

const GIT_TIMEOUT_MS = 60_000

let gitRunnerOverride: GitRunner | null = null

export function setBundledGitRunnerForTests(runner: GitRunner | null): void {
  gitRunnerOverride = runner
}

function defaultRunGit(
  cwd: string,
  args: string[],
  timeoutMs = GIT_TIMEOUT_MS
): Promise<GitRunResult> {
  return new Promise((resolve) => {
    const child = spawn('git', args, cliSpawnBase(cwd))
    let stdout = ''
    let stderr = ''
    let settled = false

    const finish = (code: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve({ code, stdout, stderr })
    }

    const timer = setTimeout(() => {
      child.kill()
      finish(1)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString()
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString()
    })
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', () => finish(1))
  })
}

export function runBundledGit(cwd: string, args: string[]): Promise<GitRunResult> {
  if (gitRunnerOverride) return gitRunnerOverride(cwd, args)
  return defaultRunGit(cwd, args)
}
