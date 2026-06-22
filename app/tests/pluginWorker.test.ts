import { describe, it, expect } from 'vitest'
import { createPluginWorker, terminatePluginWorker } from '../electron/main/pluginWorker'

describe('PluginWorker', () => {
  it('should create a worker thread', async () => {
    const worker = createPluginWorker()
    expect(worker).toBeDefined()
    expect(worker.threadId).toBeGreaterThan(0)
    await terminatePluginWorker(worker)
  })

  it('should handle worker termination gracefully', async () => {
    const worker = createPluginWorker()
    expect(() => terminatePluginWorker(worker)).not.toThrow()
    await terminatePluginWorker(worker)
  })

  it('should not crash main process on worker error', async () => {
    const worker = createPluginWorker()
    // Отправить невалидный запрос
    worker.postMessage({ type: 'invalid' })
    // Проверить, что main не упал
    expect(worker.threadId).toBeGreaterThan(0)
    await terminatePluginWorker(worker)
  })
})
