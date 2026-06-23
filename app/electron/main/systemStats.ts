import type { WebContents } from 'electron'
import { P2P_PAUSE_CPU_THRESHOLD, P2P_PAUSE_GPU_THRESHOLD } from '../../shared/constants'

type SystemInformation = typeof import('systeminformation')

let siPromise: Promise<SystemInformation> | null = null

function loadSystemInformation(): Promise<SystemInformation> {
  if (!siPromise) {
    siPromise = import('systeminformation')
  }
  return siPromise
}

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
    const si = await loadSystemInformation()
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

/** Текущая загрузка CPU/GPU (проценты, округлённые). */
export async function getSystemStats(): Promise<SystemStats> {
  const si = await loadSystemInformation()
  const [cpuLoad, graphics] = await Promise.all([si.currentLoad(), si.graphics()])
  const cpu = Math.round(cpuLoad.currentLoad)
  const rawGpu = graphics.controllers[0]?.utilizationGpu
  const gpu = rawGpu != null && rawGpu >= 0 ? Math.round(rawGpu) : null
  return { cpu, gpu }
}

/** Причина паузы P2P по уже собранным метрикам; null — можно принимать задачи. */
export function getP2pPauseReason(stats: SystemStats): string | null {
  const reasons: string[] = []
  if (stats.cpu > P2P_PAUSE_CPU_THRESHOLD) {
    reasons.push(`CPU ${stats.cpu}% (лимит ${P2P_PAUSE_CPU_THRESHOLD}%)`)
  }
  if (stats.gpu != null && stats.gpu > P2P_PAUSE_GPU_THRESHOLD) {
    reasons.push(`GPU ${stats.gpu}% (лимит ${P2P_PAUSE_GPU_THRESHOLD}%)`)
  }
  return reasons.length > 0 ? reasons.join('; ') : null
}

/** true, если входящие P2P-задачи нужно ставить на паузу. */
export function isP2pPausedDueToLoad(stats: SystemStats): boolean {
  return getP2pPauseReason(stats) !== null
}

/** Проверить текущую нагрузку; вернуть причину паузы или null. */
export async function getP2pLoadPauseReason(): Promise<string | null> {
  const stats = await getSystemStats()
  return getP2pPauseReason(stats)
}

let timer: ReturnType<typeof setInterval> | null = null
let target: WebContents | null = null

export function startSystemStatsPush(webContents: WebContents): void {
  if (timer) return
  target = webContents
  void getSystemStats().then((stats) => {
    if (target && !target.isDestroyed()) target.send('system-stats', stats)
  })
  timer = setInterval(() => {
    if (!target || target.isDestroyed()) {
      stopSystemStatsPush()
      return
    }
    void getSystemStats()
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
