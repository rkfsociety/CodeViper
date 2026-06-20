import si from 'systeminformation'
import type { WebContents } from 'electron'

export interface SystemStats {
  cpu: number
  gpu: number | null
}

export interface SystemCapabilities {
  ramGB: number
  gpuVramGB: number | null
}

/** Получить информацию о возможностях системы (RAM, GPU VRAM) */
export async function getSystemCapabilities(): Promise<SystemCapabilities> {
  try {
    const [mem, graphics] = await Promise.all([si.mem(), si.graphics()])
    const ramGB = Math.round((mem.total / (1024 * 1024 * 1024)) * 10) / 10

    let gpuVramGB: number | null = null
    if (graphics.controllers[0]?.vram) {
      gpuVramGB = Math.round((graphics.controllers[0].vram * 10) / 10)
    }

    return { ramGB, gpuVramGB }
  } catch {
    // Fallback на приблизительные значения если ошибка
    return { ramGB: 8, gpuVramGB: null }
  }
}

let timer: ReturnType<typeof setInterval> | null = null
let target: WebContents | null = null

async function collect(): Promise<SystemStats> {
  const [cpuLoad, graphics] = await Promise.all([si.currentLoad(), si.graphics()])
  const cpu = Math.round(cpuLoad.currentLoad)
  const rawGpu = graphics.controllers[0]?.utilizationGpu
  const gpu = rawGpu != null && rawGpu >= 0 ? Math.round(rawGpu) : null
  return { cpu, gpu }
}

export function startSystemStatsPush(webContents: WebContents): void {
  if (timer) return
  target = webContents
  void collect().then((stats) => {
    if (target && !target.isDestroyed()) target.send('system-stats', stats)
  })
  timer = setInterval(() => {
    if (!target || target.isDestroyed()) {
      stopSystemStatsPush()
      return
    }
    void collect()
      .then((stats) => {
        if (target && !target.isDestroyed()) target.send('system-stats', stats)
      })
      .catch(() => {})
  }, 3000)
}

export function stopSystemStatsPush(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  target = null
}
