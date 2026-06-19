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

// Очередь per-path: гарантирует последовательную запись одного файла,
// чтобы избежать гонки rename(tmp→final) при параллельных update-chat.
const writeQueues = new Map<string, Promise<void>>()

export async function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  // Дожидаемся предыдущей записи в тот же файл
  const prev = writeQueues.get(filePath) ?? Promise.resolve()
  const next = prev.then(() => _writeJsonAtomicOnce(filePath, data))
  writeQueues.set(
    filePath,
    next.catch(() => {})
  )
  return next
}

async function _writeJsonAtomicOnce(filePath: string, data: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.tmp`
  await writeFile(tmp, JSON.stringify(data, null, 2), 'utf-8')

  try {
    await rename(tmp, filePath)
  } catch (error) {
    if (process.platform === 'win32') {
      // На Windows rename поверх существующего файла иногда требует удаления цели
      await unlink(filePath).catch(() => {})
      await rename(tmp, filePath).catch(async (e2) => {
        // Если tmp тоже пропал (гонка с другим процессом) — просто логируем
        await unlink(tmp).catch(() => {})
        throw e2
      })
      return
    }
    await unlink(tmp).catch(() => {})
    throw error
  }
}
