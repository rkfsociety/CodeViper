import { existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'

/** Кандидаты путей к иконке: packaged (extraResources), asar, dev. */
export function getAppIconCandidates(): string[] {
  const winFirst = process.platform === 'win32'
  const names = winFirst ? ['icon.ico', 'icon.png'] : ['icon.png', 'icon.ico']

  const candidates: string[] = []

  if (app.isPackaged && process.resourcesPath) {
    for (const name of names) {
      candidates.push(join(process.resourcesPath, name))
    }
  }

  if (app.isPackaged) {
    for (const name of names) {
      candidates.push(join(app.getAppPath(), 'resources', name))
    }
  }

  for (const name of names) {
    candidates.push(join(__dirname, '../../resources', name))
    candidates.push(join(process.cwd(), 'resources', name))
  }

  return candidates
}

/** Путь к иконке приложения (ICO на Windows для трея и окна). */
export function resolveAppIconPath(): string | undefined {
  return getAppIconCandidates().find((path) => existsSync(path))
}
