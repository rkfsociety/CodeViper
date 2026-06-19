import { parentPort } from 'worker_threads'
import { readFile } from 'fs/promises'

type ReadRequest = {
  id: number
  type: 'read'
  filePath: string
  offset: number
  limit: number | null
  defaultLimit: number
}

parentPort!.on('message', async (msg: ReadRequest) => {
  if (msg.type !== 'read') return

  try {
    const raw = await readFile(msg.filePath, 'utf-8')
    const allLines = raw.split('\n')
    const totalLines = allLines.length
    const from = Math.max(0, msg.offset)
    const count = msg.limit != null ? Math.max(1, msg.limit) : msg.defaultLimit
    const to = Math.min(from + count, totalLines)
    const chunk = allLines.slice(from, to).join('\n')
    const remaining = totalLines - to

    const header = `[Файл: ${msg.filePath} | строки ${from + 1}–${to} из ${totalLines}]`
    const footer =
      remaining > 0 ? `\n[Ещё ${remaining} строк. Читай дальше: offset=${to}]` : `\n[Конец файла]`

    parentPort!.postMessage({ id: msg.id, type: 'result', content: `${header}\n${chunk}${footer}` })
  } catch (err) {
    parentPort!.postMessage({ id: msg.id, type: 'error', message: String(err) })
  }
})
