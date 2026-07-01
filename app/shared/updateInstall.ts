import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

export interface DetachedInstallerChild {
  on(event: 'error', listener: (err: Error) => void): unknown
  unref(): void
}

export type DetachedInstallerSpawn = (
  installer: string,
  args: string[],
  options: {
    detached: true
    stdio: 'ignore'
    windowsHide: false
  }
) => DetachedInstallerChild

/** Path to the downloaded NSIS installer in the electron-updater cache on Windows. */
export function resolveWindowsPendingInstaller(localAppData: string): string | null {
  const pendingDir = join(localAppData, 'codeviper-updater', 'pending')
  const infoPath = join(pendingDir, 'update-info.json')
  if (!existsSync(infoPath)) return null

  try {
    const raw = readFileSync(infoPath, 'utf8')
    const info = JSON.parse(raw) as { fileName?: string; path?: string }
    const fileName = info.fileName ?? info.path
    if (!fileName || typeof fileName !== 'string') return null
    const installer = join(pendingDir, fileName)
    return existsSync(installer) ? installer : null
  } catch {
    return null
  }
}

export function launchDetachedWindowsInstaller(
  installer: string,
  spawnInstaller: DetachedInstallerSpawn,
  onError?: (err: Error) => void
): boolean {
  try {
    const child = spawnInstaller(installer, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false
    })
    child.on('error', (err) => {
      onError?.(err)
    })
    child.unref()
    return true
  } catch (err) {
    onError?.(err instanceof Error ? err : new Error(String(err)))
    return false
  }
}
