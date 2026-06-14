import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import type { RebuildProgressEvent, RebuildResult, RebuildStatus } from '../../src/types'

let rebuildRunning = false
let activeChild: ChildProcess | null = null

function hasRebuildFiles(dir: string): boolean {
  return (
    existsSync(join(dir, 'package.json')) &&
    existsSync(join(dir, 'scripts/build-win.js')) &&
    existsSync(join(dir, 'node_modules'))
  )
}

export function findRebuildRoot(): string | null {
  const candidates = new Set<string>()

  if (!app.isPackaged) {
    candidates.add(app.getAppPath())
    candidates.add(join(__dirname, '../..'))
  }

  candidates.add(process.cwd())
  candidates.add(dirname(process.execPath))

  for (const dir of candidates) {
    if (hasRebuildFiles(dir)) return dir
  }

  return null
}

export function getRebuildStatus(): RebuildStatus {
  const root = findRebuildRoot()
  if (root) {
    return { available: true, root }
  }

  return {
    available: false,
    root: null,
    reason: app.isPackaged
      ? 'Portable/installer не содержит исходники — запусти npm run dev'
      : 'Не найдены package.json, node_modules и scripts/build-win.js'
  }
}

function emitLine(emit: (event: RebuildProgressEvent) => void, line: string): void {
  const trimmed = line.trim()
  if (trimmed) emit({ type: 'log', line: trimmed })
}

export async function runRebuild(
  emit: (event: RebuildProgressEvent) => void
): Promise<RebuildResult> {
  if (rebuildRunning) {
    return { ok: false, message: 'Пересборка уже выполняется' }
  }

  const status = getRebuildStatus()
  if (!status.available || !status.root) {
    return { ok: false, message: status.reason ?? 'Пересборка недоступна' }
  }

  const root = status.root
  rebuildRunning = true
  emit({ type: 'start', root })

  return new Promise((resolve) => {
    const child = spawn('npm run rebuild:exe', {
      cwd: root,
      shell: true,
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' }
    })

    activeChild = child

    const onData = (chunk: Buffer) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        emitLine(emit, line)
      }
    }

    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)

    const finish = (result: RebuildResult) => {
      rebuildRunning = false
      activeChild = null
      emit({ type: 'done', ok: result.ok, message: result.message, files: result.files })
      resolve(result)
    }

    child.on('close', (code: number | null) => {
      if (code === 0) {
        finish({
          ok: true,
          message: 'Готово: CodeViper.exe и CodeViper-Setup.exe в корне проекта',
          files: ['CodeViper.exe', 'CodeViper-Setup.exe']
        })
        return
      }

      finish({
        ok: false,
        message: `Сборка завершилась с кодом ${code ?? 'unknown'}`
      })
    })

    child.on('error', (error: Error) => {
      finish({ ok: false, message: error.message })
    })
  })
}

export function cancelRebuild(): void {
  if (!activeChild?.pid) return
  activeChild.kill()
  rebuildRunning = false
  activeChild = null
}
