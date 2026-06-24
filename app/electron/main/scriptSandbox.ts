import { writeFile, unlink } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { spawn } from 'child_process'

export type SandboxInterpreter = 'python' | 'bash' | 'powershell'

export interface SandboxResult {
  stdout: string
  stderr: string
  exitCode: number
}

/**
 * Образы Docker по интерпретатору.
 * python: официальный slim; bash/powershell: alpine с bash.
 */
const DOCKER_IMAGES: Record<SandboxInterpreter, string> = {
  python: 'python:3.11-slim',
  bash: 'alpine:3.19',
  powershell: 'mcr.microsoft.com/powershell:lts-alpine-3.17'
}

/**
 * Запустить скрипт в Docker-контейнере.
 * - Mount: projectPath → /workspace (read-write), /tmp внутри контейнера изолирован.
 * - Сеть: отключена (--network none) — скрипт не имеет доступа в интернет.
 * - Ресурсы: --memory 512m --cpus 1 — защита от runaway-процессов.
 * - Fallback: если docker недоступен, выбрасывает ошибку — вызывающий код делает fallback.
 */
export async function runScriptInSandbox(
  script: string,
  interpreter: SandboxInterpreter,
  projectPath: string,
  timeoutMs: number
): Promise<SandboxResult> {
  const ext = interpreter === 'python' ? '.py' : interpreter === 'powershell' ? '.ps1' : '.sh'
  const tmpScript = join(tmpdir(), `cv-sandbox-${Date.now()}${ext}`)
  await writeFile(tmpScript, script, 'utf8')

  // На Windows путь нужно нормализовать для Docker (слэши)
  const hostPath =
    process.platform === 'win32'
      ? projectPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1')
      : projectPath
  const hostScript =
    process.platform === 'win32'
      ? tmpScript.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '/$1')
      : tmpScript

  const image = DOCKER_IMAGES[interpreter]
  let entryCmd: string[]
  if (interpreter === 'python') {
    entryCmd = ['python', '/cv-script' + ext]
  } else if (interpreter === 'powershell') {
    entryCmd = ['pwsh', '-NoProfile', '-File', '/cv-script' + ext]
  } else {
    entryCmd = ['sh', '/cv-script' + ext]
  }

  const dockerArgs = [
    'run',
    '--rm',
    '--network',
    'none',
    '--memory',
    '512m',
    '--cpus',
    '1',
    '-v',
    `${hostPath}:/workspace`,
    '-v',
    `${hostScript}:/cv-script${ext}:ro`,
    '-w',
    '/workspace',
    image,
    ...entryCmd
  ]

  return new Promise<SandboxResult>((resolve) => {
    let stdout = ''
    let stderr = ''
    let settled = false

    const child = spawn('docker', dockerArgs, { windowsHide: true })

    const finish = (exitCode: number) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      void unlink(tmpScript).catch(() => {})
      resolve({ stdout, stderr, exitCode })
    }

    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(124) // exit code 124 = timeout (convention)
    }, timeoutMs)

    child.stdout?.on('data', (chunk: Buffer) => (stdout += chunk.toString()))
    child.stderr?.on('data', (chunk: Buffer) => (stderr += chunk.toString()))
    child.on('close', (code) => finish(code ?? 1))
    child.on('error', (err) => {
      stderr += err.message
      finish(1)
    })
  })
}

/** Проверить, что docker CLI доступен (ping). */
export async function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('docker', ['info', '--format', '{{.ServerVersion}}'], {
      windowsHide: true
    })
    let ok = false
    child.on('close', (code) => {
      ok = code === 0
      resolve(ok)
    })
    child.on('error', () => resolve(false))
    setTimeout(() => {
      child.kill()
      resolve(false)
    }, 5_000)
  })
}
