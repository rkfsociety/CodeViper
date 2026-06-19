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

// Коалесцирование записей per-path.
// Схема: не более 1 активной + 1 ожидающей записи на файл.
// Все промежуточные вызовы обновляют данные ожидающей записи, не добавляя новых.
// Это предотвращает: (a) гонку rename на Windows, (b) накопление очереди при частых вызовах.

interface PendingWrite {
  data: unknown
  promise: Promise<void>
  resolve: () => void
  reject: (e: unknown) => void
}

const activeWrites = new Map<string, Promise<void>>()
const pendingWrites = new Map<string, PendingWrite>()

export function writeJsonAtomic(filePath: string, data: unknown): Promise<void> {
  // Есть ожидающая — обновляем данные, возвращаем тот же промис
  const pending = pendingWrites.get(filePath)
  if (pending) {
    pending.data = data
    return pending.promise
  }

  // Нет активной — пишем немедленно
  const active = activeWrites.get(filePath)
  if (!active) {
    const p = _writeJsonAtomicOnce(filePath, data)
    activeWrites.set(filePath, p)
    p.finally(() => {
      activeWrites.delete(filePath)
      flushPending(filePath)
    })
    return p
  }

  // Есть активная — ставим одну ожидающую запись
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => {
    resolve = res
    reject = rej
  })
  pendingWrites.set(filePath, { data, promise, resolve, reject })
  return promise
}

function flushPending(filePath: string): void {
  const pending = pendingWrites.get(filePath)
  if (!pending) return
  pendingWrites.delete(filePath)
  const p = _writeJsonAtomicOnce(filePath, pending.data).then(pending.resolve, pending.reject)
  activeWrites.set(filePath, p)
  p.finally(() => {
    activeWrites.delete(filePath)
    flushPending(filePath)
  })
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
