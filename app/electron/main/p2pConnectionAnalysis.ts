import { readFile, stat } from 'fs/promises'
import { resolve } from 'path'
import { loadSettings } from './settings'
import { toSecureP2pUrl } from '../../shared/p2pCrypto'

export type P2pConnectionIssue = {
  scope: 'settings' | 'static' | 'runtime'
  type:
    | 'invalid-url'
    | 'missing-backoff'
    | 'missing-max-retries'
    | 'missing-connect-timeout'
    | 'health-check'
  message: string
}

async function readSourceFile(
  projectPath: string,
  optionsPath?: string
): Promise<{ path: string; source: string } | null> {
  const candidatePaths = optionsPath?.trim()
    ? [optionsPath.trim()]
    : ['app/electron/main/p2pClient.ts', 'electron/main/p2pClient.ts', 'p2pClient.ts']

  for (const candidate of candidatePaths) {
    const abs = resolve(projectPath, candidate)
    try {
      const info = await stat(abs)
      if (!info.isFile()) continue
      return { path: abs, source: await readFile(abs, 'utf8') }
    } catch {
      /* ignore */
    }
  }

  return null
}

function extractSection(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker)
  if (start === -1) return source
  const end = source.indexOf(endMarker, start + startMarker.length)
  return end === -1 ? source.slice(start) : source.slice(start, end)
}

function parsePossiblyBareUrl(raw: string): URL | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    return new URL(candidate)
  } catch {
    return null
  }
}

function validateSettingsUrl(raw: string | undefined): P2pConnectionIssue[] {
  const issues: P2pConnectionIssue[] = []
  const trimmed = raw?.trim()
  if (!trimmed) return issues

  const url = parsePossiblyBareUrl(trimmed)
  if (!url) {
    issues.push({
      scope: 'settings',
      type: 'invalid-url',
      message: 'p2pServerUrl: некорректный URL'
    })
    return issues
  }

  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol)) {
    issues.push({
      scope: 'settings',
      type: 'invalid-url',
      message: 'p2pServerUrl: поддерживаются только http(s):// или ws(s)://'
    })
  }

  if (!url.hostname) {
    issues.push({
      scope: 'settings',
      type: 'invalid-url',
      message: 'p2pServerUrl: отсутствует hostname'
    })
  }

  return issues
}

function toHealthEndpoint(raw: string): string | null {
  const parsed = parsePossiblyBareUrl(raw)
  if (!parsed) return null

  const url = new URL(toSecureP2pUrl(parsed.toString()))

  if (url.protocol === 'ws:') url.protocol = 'http:'
  if (url.protocol === 'wss:') url.protocol = 'https:'

  url.pathname = '/health'
  url.search = ''
  url.hash = ''
  return url.toString()
}

function collectStaticIssues(source: string, filePath: string): P2pConnectionIssue[] {
  const issues: P2pConnectionIssue[] = []
  const syncSection = extractSection(
    source,
    'export function syncP2pWssConnection(',
    'export function subscribeP2pTaskWss('
  )
  const subscribeSection = extractSection(
    source,
    'export function subscribeP2pTaskWss(',
    'export function acquireP2pTaskSlot('
  )

  if (!/setTimeout\s*\(/.test(syncSection) && !/backoff|reconnect|retry/i.test(syncSection)) {
    issues.push({
      scope: 'static',
      type: 'missing-backoff',
      message: `${filePath}: syncP2pWssConnection не содержит reconnect backoff/retry loop`
    })
  }

  if (!/\bmaxRetries\b/.test(syncSection)) {
    issues.push({
      scope: 'static',
      type: 'missing-max-retries',
      message: `${filePath}: syncP2pWssConnection не ограничивает число повторов через maxRetries`
    })
  }

  if (!/AbortSignal\.timeout\s*\(/.test(subscribeSection)) {
    issues.push({
      scope: 'static',
      type: 'missing-connect-timeout',
      message: `${filePath}: subscribeP2pTaskWss не задаёт timeout для подключения к WSS`
    })
  }

  return issues
}

async function readHealthCheck(settingsUrl: string): Promise<P2pConnectionIssue | null> {
  const healthUrl = toHealthEndpoint(settingsUrl)
  if (!healthUrl) {
    return {
      scope: 'runtime',
      type: 'health-check',
      message: 'health-check: не удалось построить URL /health из p2pServerUrl'
    }
  }

  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return {
        scope: 'runtime',
        type: 'health-check',
        message: `health-check ${res.status}: ${text.slice(0, 200) || 'неуспешный ответ'}`
      }
    }

    const text = await res.text().catch(() => '')
    if (!text.trim()) return null

    try {
      const parsed = JSON.parse(text) as { ok?: unknown }
      if (parsed.ok === false) {
        return {
          scope: 'runtime',
          type: 'health-check',
          message: 'health-check: сервер ответил ok=false'
        }
      }
    } catch {
      /* not JSON is acceptable if status is 200 */
    }

    return null
  } catch (e) {
    return {
      scope: 'runtime',
      type: 'health-check',
      message: `health-check: ${(e as Error).message}`
    }
  }
}

export async function findP2pConnectionIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const sourceFile = await readSourceFile(projectPath, options.path)
  if (!sourceFile) {
    return 'p2pClient.ts не найден'
  }

  const issues: P2pConnectionIssue[] = []
  issues.push(...collectStaticIssues(sourceFile.source, sourceFile.path))

  const settings = await loadSettings()
  issues.push(...validateSettingsUrl(settings.p2pServerUrl))

  const settingsUrl = settings.p2pServerUrl?.trim()
  if (settingsUrl) {
    const hasSettingsIssue = validateSettingsUrl(settingsUrl).length > 0
    if (!hasSettingsIssue) {
      const runtimeIssue = await readHealthCheck(settingsUrl)
      if (runtimeIssue) issues.push(runtimeIssue)
    }
  }

  if (!issues.length) return 'find_p2p_connection_issues(): Проблем P2P connection не найдено.'

  return [
    `find_p2p_connection_issues(): найдено ${issues.length} проблем P2P connection:`,
    ...issues.map((issue, index) => `[${index + 1}] [${issue.scope}] ${issue.message}`)
  ].join('\n')
}
