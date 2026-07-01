import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { loadSettings } from './settings'

export type P2pCreditIssue = {
  scope: 'static' | 'runtime'
  type: 'negative-balance' | 'nan' | 'limit'
  message: string
}

function parseNumberLiteral(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : Number.NaN
}

function collectStaticIssues(source: string): P2pCreditIssue[] {
  const issues: P2pCreditIssue[] = []
  const limitMatches = [
    ...source.matchAll(
      /P2P_(?:INITIAL|TASK)_CREDIT_(?:COST|REWARD)\s*=\s*parseInt\([^)]*['"]([^'"]+)['"]/g
    )
  ]
  for (const match of limitMatches) {
    const value = parseNumberLiteral(match[1] ?? '')
    if (value == null || Number.isNaN(value)) {
      issues.push({
        scope: 'static',
        type: 'nan',
        message: `некорректный числовой лимит: ${match[0]}`
      })
      continue
    }
    if (value < 0) {
      issues.push({
        scope: 'static',
        type: 'negative-balance',
        message: `отрицательный лимит кредов: ${value}`
      })
    }
  }

  if (/Math\.max\(0,\s*balance\)/.test(source) === false) {
    issues.push({
      scope: 'static',
      type: 'limit',
      message: 'отсутствует ограничение Math.max(0, balance) при записи баланса'
    })
  }

  if (/InsufficientCreditsError/.test(source) && !/senderBalance < cost/.test(source)) {
    issues.push({
      scope: 'static',
      type: 'limit',
      message: 'не найдена защита от отрицательного баланса senderBalance < cost'
    })
  }

  return issues
}

async function readRuntimeBalance(): Promise<
  { ok: true; balance: number } | { ok: false; message: string }
> {
  const settings = await loadSettings()
  const url = settings.p2pServerUrl?.trim()
  const token = settings.p2pAuthToken?.trim()
  if (!url || !token)
    return { ok: false, message: 'P2P runtime недоступен: не заданы p2pServerUrl/p2pAuthToken' }

  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/credits/balance`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000)
    })
    if (!res.ok) return { ok: false, message: `runtime balance ${res.status}` }
    const data = (await res.json()) as { ok?: boolean; balance?: unknown }
    const balance = Number(data.balance)
    if (!Number.isFinite(balance)) {
      return { ok: false, message: 'runtime balance NaN' }
    }
    return { ok: true, balance }
  } catch (e) {
    return { ok: false, message: (e as Error).message }
  }
}

export async function findP2pCreditIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const target = resolve(projectPath, options.path?.trim() || '../../server/p2p/src/credits.ts')
  let source = ''
  try {
    source = await readFile(target, 'utf8')
  } catch {
    return `credits.ts не найден: ${target}`
  }

  const issues: P2pCreditIssue[] = collectStaticIssues(source)
  const runtime = await readRuntimeBalance()
  if (runtime.ok) {
    if (runtime.balance < 0) {
      issues.push({
        scope: 'runtime',
        type: 'negative-balance',
        message: `runtime balance отрицательный: ${runtime.balance}`
      })
    }
    if (Number.isNaN(runtime.balance)) {
      issues.push({ scope: 'runtime', type: 'nan', message: 'runtime balance NaN' })
    }
  }

  if (!issues.length) return 'Некорректных P2P-кредитов не найдено.'

  return [
    `Найдено ${issues.length} проблем P2P credits:`,
    ...issues.map((issue, index) => `[${index + 1}] [${issue.scope}] ${issue.message}`)
  ].join('\n')
}
