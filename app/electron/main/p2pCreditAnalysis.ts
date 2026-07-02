import { readFile } from 'fs/promises'
import { resolve } from 'path'
import { fetchP2pCreditsBalance } from './p2pClient'
import { loadSettings } from './settings'

export type P2pCreditIssue = {
  scope: 'static' | 'runtime'
  type: 'negative-balance' | 'nan' | 'limit'
  message: string
  line?: number
}

const DEFAULT_CREDITS_PATH = '../../server/p2p/src/credits.ts'

function countLine(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function strictInteger(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed || !/^[+-]?\d+$/.test(trimmed)) return Number.NaN
  return Number(trimmed)
}

function pushIssue(
  issues: P2pCreditIssue[],
  scope: P2pCreditIssue['scope'],
  type: P2pCreditIssue['type'],
  message: string,
  line?: number
): void {
  issues.push({ scope, type, message, ...(line ? { line } : {}) })
}

function collectStaticIssues(source: string): P2pCreditIssue[] {
  const issues: P2pCreditIssue[] = []

  const creditConstPatterns = [
    {
      name: 'P2P_INITIAL_CREDITS',
      regex:
        /export const P2P_INITIAL_CREDITS\s*=\s*parseInt\(\s*process\.env\.P2P_INITIAL_CREDITS\s*\?\?\s*(['"])(.*?)\1\s*,\s*10\s*\)/
    },
    {
      name: 'P2P_TASK_CREDIT_COST',
      regex:
        /export const P2P_TASK_CREDIT_COST\s*=\s*parseInt\(\s*process\.env\.P2P_TASK_CREDIT_COST\s*\?\?\s*(['"])(.*?)\1\s*,\s*10\s*\)/
    },
    {
      name: 'P2P_TASK_CREDIT_REWARD',
      regex:
        /export const P2P_TASK_CREDIT_REWARD\s*=\s*parseInt\(\s*process\.env\.P2P_TASK_CREDIT_REWARD\s*\?\?\s*(['"])(.*?)\1\s*,\s*10\s*\)/
    }
  ] as const

  for (const { name, regex } of creditConstPatterns) {
    const match = source.match(regex)
    if (!match) continue
    const rawDefault = match[2] ?? ''
    const line = match.index != null ? countLine(source, match.index) : undefined
    const parsed = strictInteger(rawDefault)

    if (parsed == null || Number.isNaN(parsed)) {
      pushIssue(
        issues,
        'static',
        'nan',
        `${name} использует некорректный дефолт "${rawDefault}"`,
        line
      )
      continue
    }

    if (parsed < 0) {
      pushIssue(
        issues,
        'static',
        'negative-balance',
        `${name} содержит отрицательный лимит ${parsed}`,
        line
      )
    }
  }

  const readRawPattern = /parseInt\(\s*raw\s*,\s*10\s*\)/
  if (
    readRawPattern.test(source) &&
    !/Number\.is(?:Finite|NaN)\(\s*(?:raw|Number\(raw\))\s*\)/.test(source)
  ) {
    const match = source.match(readRawPattern)
    const line = match?.index != null ? countLine(source, match.index) : undefined
    pushIssue(
      issues,
      'static',
      'nan',
      'readRaw() возвращает parseInt(raw, 10) без проверки NaN',
      line
    )
  }

  if (!/Math\.max\(0,\s*balance\)/.test(source)) {
    pushIssue(
      issues,
      'static',
      'limit',
      'writeRaw() не ограничивает записываемый баланс через Math.max(0, balance)'
    )
  }

  if (!/senderBalance\s*<\s*(?:cost|P2P_TASK_CREDIT_COST)/.test(source)) {
    pushIssue(
      issues,
      'static',
      'limit',
      'settleTask() не проверяет senderBalance < cost перед списанием'
    )
  }

  return issues
}

async function readRuntimeBalance(): Promise<
  { ok: true; balance: number } | { ok: false; message: string }
> {
  const settings = await loadSettings()
  const hasRuntime =
    Boolean(settings.p2pServerUrl?.trim()) && Boolean(settings.p2pAuthToken?.trim())
  if (!hasRuntime) {
    return {
      ok: false,
      message: 'P2P runtime недоступен: не заданы p2pServerUrl/p2pAuthToken'
    }
  }

  const result = await fetchP2pCreditsBalance(settings)
  if (!result.ok) {
    return { ok: false, message: result.message ?? 'runtime credits unavailable' }
  }

  if (!Number.isFinite(result.balance)) {
    return { ok: false, message: 'runtime balance NaN' }
  }

  return { ok: true, balance: result.balance }
}

export async function findP2pCreditIssues(
  projectPath: string,
  options: { path?: string } = {}
): Promise<string> {
  const target = resolve(projectPath, options.path?.trim() || DEFAULT_CREDITS_PATH)

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

  if (!issues.length) return 'Некорректных P2P credits не найдено.'

  return [
    `Найдено ${issues.length} проблем P2P credits:`,
    ...issues.map((issue, index) => {
      const line = issue.line ? `:L${issue.line}` : ''
      return `[${index + 1}] [${issue.scope}${line}] ${issue.message}`
    })
  ].join('\n')
}
