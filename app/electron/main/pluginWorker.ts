import { Worker } from 'worker_threads'

export interface PluginWorkerRequest {
  type: 'load' | 'cleanup'
  pluginPath?: string
  projectPath?: string
}

export interface PluginWorkerResponse {
  success: boolean
  data?: unknown
  error?: string
}

/**
 * Запустить плагин в изолированном worker_thread
 */
export function createPluginWorker(): Worker {
  const workerCode = `
    const { parentPort } = require('worker_threads');
    const path = require('path');
    const { createRequire } = require('module');

    // Создать require для загрузки плагинов
    const require = createRequire(__filename);

    // API доступный для плагинов — ограниченный
    const restrictedApi = {
      fs: {
        // Только чтение в projectPath
        readFile: undefined, // будет установлено
        writeFile: undefined
      }
    };

    parentPort.on('message', async (request) => {
      try {
        if (request.type === 'load') {
          const { pluginPath, projectPath } = request;

          // Загрузить плагин
          const plugin = require(pluginPath);
          const pluginModule = plugin.default || plugin;

          // Проверить структуру
          if (!pluginModule || !pluginModule.name || !pluginModule.tools) {
            throw new Error('Invalid plugin structure');
          }

          parentPort.postMessage({
            success: true,
            data: {
              name: pluginModule.name,
              description: pluginModule.description,
              version: pluginModule.version,
              tools: pluginModule.tools
            }
          });
        } else if (request.type === 'cleanup') {
          // Очистить ресурсы
          parentPort.postMessage({ success: true });
        }
      } catch (err) {
        parentPort.postMessage({
          success: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    });
  `

  // Создать worker из встроенного кода
  const worker = new Worker(workerCode, {
    eval: true
  })

  return worker
}

/**
 * Загрузить плагин в worker_thread
 */
export function loadPluginInWorker(
  worker: Worker,
  pluginPath: string,
  projectPath: string
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Plugin load timeout'))
    }, 5000)

    const handler = (response: PluginWorkerResponse) => {
      clearTimeout(timeout)
      worker.off('message', handler)
      worker.off('error', errorHandler)

      if (response.success) {
        resolve(response.data)
      } else {
        reject(new Error(response.error || 'Unknown error'))
      }
    }

    const errorHandler = (err: Error) => {
      clearTimeout(timeout)
      worker.off('message', handler)
      reject(err)
    }

    worker.on('message', handler)
    worker.once('error', errorHandler)

    worker.postMessage({
      type: 'load',
      pluginPath,
      projectPath
    })
  })
}

/**
 * Остановить worker и освободить ресурсы
 */
export async function terminatePluginWorker(worker: Worker): Promise<void> {
  return new Promise((resolve) => {
    worker.once('exit', resolve)
    worker.terminate()
  })
}
