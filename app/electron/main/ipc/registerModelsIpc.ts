import { dialog, ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import {
  fetchOllamaModelsWithDetails,
  pingOllama,
  pullOllamaModel,
  deleteOllamaModel
} from '../agent'
import { checkAgentPrerequisites } from '../agentPrerequisites'
import { ModelRuntime } from '../modelRuntime'
import { getSystemCapabilities } from '../systemStats'
import { enrichModelCapabilities } from '../modelSelection'
import { downloadDefaultGguf, cancelGgufDownload } from '../orchestratorModel'
import { runBenchmark } from '../modelBenchmark'
import { app } from 'electron'
import type { IpcContext } from './ipcContext'

export function registerModelsIpc(ctx: IpcContext): void {
  const { getWindow } = ctx

  ipcMain.handle('check-ollama', async (_e, url = 'http://127.0.0.1:11434') => pingOllama(url))

  ipcMain.handle('check-qdrant', async (_e, url: string, apiKey?: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['api-key'] = apiKey
      const res = await fetch(`${url.replace(/\/$/, '')}/collections`, {
        headers,
        signal: AbortSignal.timeout(5000)
      })
      return res.ok
    } catch {
      return false
    }
  })

  ipcMain.handle('check-milvus', async (_e, url: string, apiKey?: string) => {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
      const res = await fetch(`${url.replace(/\/$/, '')}/v2/vectordb/collections/list`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(5000)
      })
      return res.ok
    } catch {
      return false
    }
  })

  ipcMain.handle('list-ollama-models', async (_e, url = 'http://127.0.0.1:11434') => {
    const models = await fetchOllamaModelsWithDetails(url)
    const systemCaps = await getSystemCapabilities()
    return enrichModelCapabilities(models, systemCaps)
  })

  ipcMain.handle(
    'list-provider-models',
    async (_e, config: { type: string; baseUrl?: string; apiKey?: string }) => {
      const runtime = new ModelRuntime(config)
      return runtime.listModels()
    }
  )

  ipcMain.handle('pull-ollama-model', async (_e, url: string, model: string) => {
    await pullOllamaModel(url, model, (progress) => {
      getWindow()?.webContents.send('ollama-pull-progress', progress)
    })
  })

  ipcMain.handle('delete-ollama-model', async (_e, url: string, model: string) => {
    await deleteOllamaModel(url, model)
  })

  ipcMain.handle(
    'check-agent-prerequisites',
    async (_e, ollamaUrl: string, projectPath: string, skipOllamaCheck = false) =>
      checkAgentPrerequisites(ollamaUrl, projectPath, skipOllamaCheck)
  )

  ipcMain.handle(IPC.SELECT_GGUF_FILE, async () => {
    const result = await dialog.showOpenDialog(getWindow()!, {
      title: 'Выбрать GGUF-модель',
      filters: [{ name: 'GGUF-модели', extensions: ['gguf'] }],
      properties: ['openFile']
    })
    return result.canceled ? null : (result.filePaths[0] ?? null)
  })

  ipcMain.handle(IPC.DOWNLOAD_GGUF, async () => {
    try {
      return await downloadDefaultGguf(app.getPath('userData'), (downloaded, total) => {
        getWindow()?.webContents.send(IPC.GGUF_DOWNLOAD_PROGRESS, { downloaded, total })
      })
    } finally {
      getWindow()?.webContents.send(IPC.GGUF_DOWNLOAD_PROGRESS, null)
    }
  })

  ipcMain.on(IPC.CANCEL_GGUF_DOWNLOAD, () => {
    cancelGgufDownload()
  })

  ipcMain.handle(IPC.BENCHMARK_MODEL, async (_e, ...a) => {
    const [ollamaUrl, model] = parseIpcArgs(Contracts[IPC.BENCHMARK_MODEL].args, a)
    return runBenchmark(ollamaUrl, model)
  })
}
