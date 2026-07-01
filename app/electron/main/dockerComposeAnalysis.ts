import { readFile, stat } from 'fs/promises'
import { resolve } from 'path'
import YAML from 'yaml'

export type DockerPortIssue = {
  service: string
  file: string
  type: 'duplicate-host-port' | 'publish-without-bind'
  hostPort?: number
  containerPort?: string
  mapping?: string
  message: string
}

export type DockerComposeAnalysisResult = {
  issues: DockerPortIssue[]
}

function toStringValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function parsePortMapping(raw: unknown): { hostPort?: number; containerPort?: string } | null {
  if (typeof raw === 'number') return { containerPort: String(raw) }
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.includes('=')) return null

  const parts = trimmed.split(':')
  if (parts.length === 1) {
    return { containerPort: parts[0] }
  }

  const host = parts[0]?.trim()
  const container = parts[parts.length - 1]?.trim()
  if (!host || !container) return null
  const hostPort = Number(host)
  return Number.isInteger(hostPort) ? { hostPort, containerPort: container } : null
}

function collectServicePorts(
  serviceName: string,
  composeFile: string,
  service: Record<string, unknown>,
  issues: DockerPortIssue[],
  hostPorts: Map<number, Array<{ service: string; file: string; mapping: string }>>
): void {
  const ports = Array.isArray(service.ports) ? service.ports : []

  for (const entry of ports) {
    const mapping = parsePortMapping(entry)
    if (!mapping) continue
    if (mapping.hostPort == null) {
      issues.push({
        service: serviceName,
        file: composeFile,
        type: 'publish-without-bind',
        containerPort: mapping.containerPort,
        mapping: toStringValue(entry),
        message: 'publish без bind: отсутствует host-порт, используется только container-port'
      })
      continue
    }

    const mappingText = toStringValue(entry)
    const existing = hostPorts.get(mapping.hostPort) ?? []
    existing.push({ service: serviceName, file: composeFile, mapping: mappingText })
    hostPorts.set(mapping.hostPort, existing)
  }
}

async function resolveComposeFilePath(projectPath: string, path?: string): Promise<string | null> {
  const raw = path?.trim()
  const base = raw ? resolve(projectPath, raw) : resolve(projectPath, 'docker-compose.yml')

  try {
    const info = await stat(base)
    if (info.isFile()) return base
    if (info.isDirectory()) {
      for (const candidate of [
        'docker-compose.yml',
        'docker-compose.yaml',
        'compose.yml',
        'compose.yaml'
      ]) {
        try {
          const candidatePath = resolve(base, candidate)
          const candidateInfo = await stat(candidatePath)
          if (candidateInfo.isFile()) return candidatePath
        } catch {
          /* ignore */
        }
      }
    }
  } catch {
    /* ignore */
  }

  return null
}

async function readComposeFile(path: string): Promise<Record<string, unknown> | null> {
  try {
    const raw = await readFile(path, 'utf8')
    const parsed = YAML.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Record<string, unknown>
  } catch {
    return null
  }
}

export async function findDockerPortIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const composeFile = await resolveComposeFilePath(projectPath, options.path)
  if (!composeFile) return 'docker-compose.yml не найден'
  const compose = await readComposeFile(composeFile)
  if (!compose) return `docker-compose.yml не найден или не удалось прочитать: ${composeFile}`

  const services = compose.services
  if (!services || typeof services !== 'object' || Array.isArray(services)) {
    return 'docker-compose.yml: секция services не найдена'
  }

  const issues: DockerPortIssue[] = []
  const hostPorts = new Map<number, Array<{ service: string; file: string; mapping: string }>>()

  for (const [serviceName, rawService] of Object.entries(services as Record<string, unknown>)) {
    if (!rawService || typeof rawService !== 'object' || Array.isArray(rawService)) continue
    collectServicePorts(
      serviceName,
      composeFile,
      rawService as Record<string, unknown>,
      issues,
      hostPorts
    )
  }

  for (const [hostPort, entries] of hostPorts.entries()) {
    if (entries.length < 2) continue
    issues.push({
      service: entries[0]!.service,
      file: entries[0]!.file,
      type: 'duplicate-host-port',
      hostPort,
      mapping: entries.map((entry) => `${entry.service}: ${entry.mapping}`).join(', '),
      message: `дублируется host-порт ${hostPort}`
    })
  }

  if (!issues.length) return 'Конфликтов портов и publish без bind не найдено.'

  const lines = [`Найдено ${issues.length} проблем docker-compose портов:`]
  issues.forEach((issue, index) => {
    const details =
      issue.type === 'duplicate-host-port'
        ? `host=${issue.hostPort}; ${issue.mapping}`
        : `container=${issue.containerPort}; ${issue.mapping}`
    lines.push(
      `[${index + 1}] ${issue.service} (${issue.file})\n    ${issue.message}\n    ${details}`
    )
  })
  return lines.join('\n')
}
