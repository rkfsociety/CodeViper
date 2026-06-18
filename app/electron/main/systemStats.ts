import si from 'systeminformation'
import type { WebContents } from 'electron'

export interface SystemStats {
  cpu: number
  gpu: number | null
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
  }, 2000)
}

export function stopSystemStatsPush(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  target = null
}
