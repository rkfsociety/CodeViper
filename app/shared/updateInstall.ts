import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

/** Путь к скачанному NSIS-установщику в кэше electron-updater (Windows). */
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
