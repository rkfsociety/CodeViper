import { existsSync } from 'fs'
import { join } from 'path'

/** Путь к иконке приложения (ICO на Windows для трея и окна). */
export function resolveAppIconPath(): string | undefined {
  const candidates =
    process.platform === 'win32'
      ? [
          join(__dirname, '../../resources/icon.ico'),
          join(process.cwd(), 'resources/icon.ico'),
          join(__dirname, '../../resources/icon.png'),
          join(process.cwd(), 'resources/icon.png')
        ]
      : [
          join(__dirname, '../../resources/icon.png'),
          join(process.cwd(), 'resources/icon.png'),
          join(__dirname, '../../resources/icon.ico'),
          join(process.cwd(), 'resources/icon.ico')
        ]
  return candidates.find((path) => existsSync(path))
}
