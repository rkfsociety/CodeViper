import { mkdir, rename, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'

/**
 * Переименовывает повреждённый файл в `${path}.corrupt-<ts>`, чтобы не потерять
 * данные при ошибке разбора (вместо молчаливой перезаписи пустым содержимым).
 * Best-effort: при неудаче не бросает.
 */
export async function backupCorruptFile(filePath: string): Promise<void> {
  const backup = `${filePath}.corrupt-${Date.now()}`
  await rename(filePath, backup).catch(() => {})
}

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')

  try {
    await rename(tmp, filePath)
  } catch (error) {
    if (process.platform === 'win32') {
      await unlink(filePath).catch(() => {})
      await rename(tmp, filePath)
      return
    }
    await unlink(tmp).catch(() => {})
    throw error
  }
}
