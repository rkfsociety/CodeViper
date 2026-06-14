import { spawn, type ChildProcess } from 'child_process'
import { app } from 'electron'
import { existsSync } from 'fs'
import { join, dirname } from 'path'
import { getRebuildSourcePath, setRebuildSourcePath } from './appSettings'
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

export function validateRebuildRoot(dir: string): boolean {
  return hasRebuildFiles(dir)
}

export function findRebuildRoot(savedSourcePath: string | null = null): string | null {
  const candidates: string[] = []

  if (savedSourcePath) candidates.push(savedSourcePath)

  if (!app.isPackaged) {
    candidates.push(app.getAppPath())
    candidates.push(join(__dirname, '../..'))
  }

  candidates.push(process.cwd())
  candidates.push(dirname(process.execPath))

  const seen = new Set<string>()
  for (const dir of candidates) {
    const normalized = dir.trim()
    if (!normalized || seen.has(normalized.toLowerCase())) continue
    seen.add(normalized.toLowerCase())
    if (hasRebuildFiles(normalized)) return normalized
  }

  return null
}

export async function getRebuildStatus(): Promise<RebuildStatus> {
  const savedSourcePath = await getRebuildSourcePath()
  const root = findRebuildRoot(savedSourcePath)
  const packaged = app.isPackaged

  if (root) {
    return { available: true, root, packaged, savedSourcePath }
  }

  return {
    available: false,
    root: null,
    packaged,
    savedSourcePath,
    reason: packaged
      ? savedSourcePath
        ? 'В сохранённой папке нет node_modules — выполни npm install в исходниках CodeViper'
        : 'Portable exe не содержит исходники. Укажите папку с package.json и node_modules'
      : 'Не найдены package.json, node_modules и scripts/build-win.js'
  }
}

export async function rememberRebuildSourcePath(dir: string): Promise<RebuildStatus> {
  await setRebuildSourcePath(dir)
  return getRebuildStatus()
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

  const status = await getRebuildStatus()
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
          message: `Готово: CodeViper.exe в ${root}`,
          files: ['CodeViper.exe']
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
