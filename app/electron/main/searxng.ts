import { spawn, execSync } from 'child_process'
import type { ChildProcess } from 'child_process'

const CONTAINER_NAME = 'codeviper-searxng'
const IMAGE = 'searxng/searxng:latest'
const PORT = 18888
export const SEARXNG_URL = `http://localhost:${PORT}`

let containerProcess: ChildProcess | null = null
let started = false

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore', timeout: 5000 })
    return true
  } catch {
    return false
  }
}

function isContainerRunning(): boolean {
  try {
    const out = execSync(`docker inspect -f "{{.State.Running}}" ${CONTAINER_NAME}`, {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    })
      .toString()
      .trim()
    return out === 'true'
  } catch {
    return false
  }
}

function removeStaleContainer(): void {
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 10_000 })
  } catch {
    // контейнера не было — нормально
  }
}

export async function startSearXNG(): Promise<boolean> {
  if (started) return true
  if (!dockerAvailable()) return false

  // Убираем возможный зависший контейнер с прошлого запуска
  if (isContainerRunning()) {
    removeStaleContainer()
  } else {
    try {
      execSync(`docker rm ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 5000 })
    } catch {
      // нет контейнера — ок
    }
  }

  return new Promise((resolve) => {
    containerProcess = spawn(
      'docker',
      [
        'run',
        '--rm',
        '--name',
        CONTAINER_NAME,
        '-p',
        `${PORT}:8080`,
        '-e',
        'SEARXNG_SETTINGS_PATH=/etc/searxng/settings.yml',
        IMAGE
      ],
      { stdio: 'ignore', detached: false }
    )

    containerProcess.on('error', () => resolve(false))
    containerProcess.on('exit', (code) => {
      started = false
      containerProcess = null
      if (code !== 0 && code !== null) {
        // контейнер упал — не критично, web_search вернётся к DuckDuckGo
      }
    })

    // Даём контейнеру время подняться — ждём до 30 с
    const deadline = Date.now() + 30_000
    const poll = async (): Promise<void> => {
      try {
        const resp = await fetch(`${SEARXNG_URL}/healthz`, { signal: AbortSignal.timeout(2000) })
        if (resp.ok) {
          started = true
          resolve(true)
          return
        }
      } catch {
        // ещё не готов
      }
      if (Date.now() < deadline) {
        setTimeout(() => void poll(), 1000)
      } else {
        resolve(false)
      }
    }

    // Первая проверка через 2 с — контейнер не мгновенный
    setTimeout(() => void poll(), 2000)
  })
}

export function stopSearXNG(): void {
  if (containerProcess) {
    containerProcess.kill('SIGTERM')
    containerProcess = null
  }
  started = false
  try {
    execSync(`docker rm -f ${CONTAINER_NAME}`, { stdio: 'ignore', timeout: 10_000 })
  } catch {
    // уже остановлен
  }
}

export function isSearXNGReady(): boolean {
  return started
}
