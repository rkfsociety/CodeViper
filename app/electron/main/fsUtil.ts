import { mkdir, rename, unlink, writeFile } from 'fs/promises'
import { dirname } from 'path'

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
