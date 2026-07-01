import { appendFile, mkdir, readFile, readdir } from 'fs/promises'
import { join } from 'path'
import { app } from 'electron'
import { tronParse, tronStringify } from '../lib/tron'
import { redactSecretsDeep } from '../../shared/secretRedaction'
import { findModelPricing, estimateRequestCost } from '../../shared/constants'
import { aggregateTraceEvents } from '../../shared/traceMetrics'
import { loadAllChatTraceEventsFromDisk } from './traceStorage'

export interface AgentLogEntry {
  ts?: string
  event: string
  [key: string]: unknown
}

export interface AgentMetricRow {
  model: string
  runs: number
  successRuns: number
  avgDurationMs: number
  totalTokens: number
  toolCalls: number
  estimatedCostUsd: number
}

export interface AgentMetrics {
  byModel: AgentMetricRow[]
  topTools: Array<{ tool: string; count: number }>
  totalRuns: number
  totalSuccessRuns: number
  totalTokens: number
  totalCostUsd: number
  periodDays: number
}

export interface AgentTraceErrorSummary {
  ts: number
  kind: string
  tool?: string
  label: string
  message: string
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10)
}

function dateStampForDaysAgo(daysAgo: number): string {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

function truncateSummary(value: unknown): string {
  const text = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 300 ? `${text.slice(0, 300)}…` : text
}

class AgentLogger {
  private dir: string | null = null
  private incognito = false

  setIncognito(flag: boolean): void {
    this.incognito = flag
  }

  private logsDir(): string {
    if (!this.dir) {
      this.dir = join(app.getPath('userData'), 'logs')
    }
    return this.dir
  }

  private filePath(): string {
    return join(this.logsDir(), `agent-${dateStamp()}.ndjson`)
  }

  async write(entry: AgentLogEntry): Promise<void> {
    if (this.incognito) return
    try {
      await mkdir(this.logsDir(), { recursive: true })
      const line =
        tronStringify(redactSecretsDeep({ ts: new Date().toISOString(), ...entry })) + '\n'
      await appendFile(this.filePath(), line, 'utf8')
    } catch {
      // логирование необязательно — не прерываем работу агента
    }
  }

  async readMetrics(days = 30): Promise<AgentMetrics> {
    const [traceMetrics, logMetrics] = await Promise.all([
      this.readMetricsFromTraces(days),
      this.readMetricsFromLogs(days)
    ])
    return mergeAgentMetrics(traceMetrics, logMetrics, days)
  }

  async readRecentErrorSummaries(days = 7, limit = 5): Promise<AgentTraceErrorSummary[]> {
    const safeDays = Math.min(90, Math.max(1, Math.floor(days) || 7))
    const safeLimit = Math.min(20, Math.max(1, Math.floor(limit) || 5))
    const cutoffTs = Date.now() - safeDays * 86_400_000
    const summaries: AgentTraceErrorSummary[] = []

    const events = await loadAllChatTraceEventsFromDisk()
    for (const ev of events) {
      if (ev.ts < cutoffTs) continue
      const data = ev.data ?? {}
      const isFailedTool =
        ev.kind === 'tool_result' && (data.ok === false || typeof data.error === 'string')
      const isLlmError = ev.kind === 'llm_response' && typeof data.error === 'string'
      const isRunError =
        ev.kind === 'run_end' && (data.status === 'error' || data.status === 'aborted')
      if (!isFailedTool && !isLlmError && !isRunError) continue

      const rawMessage =
        typeof data.error === 'string'
          ? data.error
          : typeof data.message === 'string'
            ? data.message
            : ev.label
      summaries.push({
        ts: ev.ts,
        kind: ev.kind,
        tool: typeof data.tool === 'string' ? data.tool : undefined,
        label: ev.label,
        message: truncateSummary(redactSecretsDeep(rawMessage))
      })
    }

    summaries.sort((a, b) => b.ts - a.ts)
    return summaries.slice(0, safeLimit)
  }

  private async readMetricsFromTraces(days: number): Promise<AgentMetrics> {
    const cutoffTs = Date.now() - days * 86_400_000
    const events = await loadAllChatTraceEventsFromDisk()
    const { byModel, toolCount } = aggregateTraceEvents(events, cutoffTs)
    return this._buildMetricsFromMaps(byModel, toolCount, days)
  }

  private async readMetricsFromLogs(days: number): Promise<AgentMetrics> {
    const dir = this.logsDir()
    const cutoff = dateStampForDaysAgo(days)
    const byModel = new Map<
      string,
      {
        runs: number
        successRuns: number
        totalMs: number
        totalTokens: number
        toolCalls: number
        costUsd: number
      }
    >()
    const toolCount = new Map<string, number>()

    let files: string[] = []
    try {
      files = (await readdir(dir)).filter((f) => f.startsWith('agent-') && f.endsWith('.ndjson'))
    } catch {
      return this._emptyMetrics(days)
    }

    for (const file of files) {
      // Имя файла: agent-YYYY-MM-DD.ndjson
      const dateStr = file.slice('agent-'.length, file.length - '.ndjson'.length)
      if (dateStr < cutoff) continue

      let content = ''
      try {
        content = await readFile(join(dir, file), 'utf8')
      } catch {
        continue
      }

      for (const line of content.split('\n')) {
        if (!line.trim()) continue
        let entry: Record<string, unknown>
        try {
          entry = tronParse(line) as Record<string, unknown>
        } catch {
          continue
        }

        const event = entry['event'] as string | undefined
        const model = (entry['model'] as string | undefined) ?? 'unknown'

        if (event === 'run_start') {
          const row = byModel.get(model) ?? {
            runs: 0,
            successRuns: 0,
            totalMs: 0,
            totalTokens: 0,
            toolCalls: 0,
            costUsd: 0
          }
          row.runs++
          byModel.set(model, row)
        } else if (event === 'run_end') {
          const row = byModel.get(model) ?? {
            runs: 0,
            successRuns: 0,
            totalMs: 0,
            totalTokens: 0,
            toolCalls: 0,
            costUsd: 0
          }
          const ms = (entry['total_ms'] as number | undefined) ?? 0
          row.totalMs += ms
          // Legacy entries without status field are treated as successful
          if (!entry['status'] || entry['status'] === 'ok') {
            row.successRuns++
          }
          const sessionTokens = (entry['session_tokens'] as number | undefined) ?? 0
          if (sessionTokens > 0) row.totalTokens += sessionTokens
          const sessionCostUsd = (entry['session_cost_usd'] as number | undefined) ?? 0
          if (sessionCostUsd > 0) row.costUsd += sessionCostUsd
          byModel.set(model, row)
        } else if (event === 'llm_response') {
          const row = byModel.get(model) ?? {
            runs: 0,
            successRuns: 0,
            totalMs: 0,
            totalTokens: 0,
            toolCalls: 0,
            costUsd: 0
          }
          const tokens = (entry['tokens'] as number | undefined) ?? 0
          row.totalTokens += tokens
          // Estimate cost from output tokens (Ollama: only output tokens available)
          if (tokens > 0) {
            const pricing = findModelPricing(model)
            if (pricing) {
              row.costUsd += estimateRequestCost(pricing, 0, tokens, 0)
            }
          }
          byModel.set(model, row)
        } else if (event === 'tool_call') {
          const tool = (entry['tool'] as string | undefined) ?? 'unknown'
          toolCount.set(tool, (toolCount.get(tool) ?? 0) + 1)

          const row = byModel.get(model) ?? {
            runs: 0,
            successRuns: 0,
            totalMs: 0,
            totalTokens: 0,
            toolCalls: 0,
            costUsd: 0
          }
          row.toolCalls++
          byModel.set(model, row)
        }
      }
    }

    return this._buildMetricsFromMaps(byModel, toolCount, days)
  }

  private _buildMetricsFromMaps(
    byModel: Map<
      string,
      {
        runs: number
        successRuns: number
        totalMs: number
        totalTokens: number
        toolCalls: number
        costUsd: number
      }
    >,
    toolCount: Map<string, number>,
    days: number
  ): AgentMetrics {
    const rows: AgentMetricRow[] = Array.from(byModel.entries()).map(([model, r]) => ({
      model,
      runs: r.runs,
      successRuns: r.successRuns,
      avgDurationMs: r.runs > 0 ? Math.round(r.totalMs / Math.max(r.successRuns, 1)) : 0,
      totalTokens: r.totalTokens,
      toolCalls: r.toolCalls,
      estimatedCostUsd: r.costUsd
    }))

    rows.sort((a, b) => b.runs - a.runs)

    const topTools = Array.from(toolCount.entries())
      .map(([tool, count]) => ({ tool, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    const totalRuns = rows.reduce((s, r) => s + r.runs, 0)
    const totalSuccessRuns = rows.reduce((s, r) => s + r.successRuns, 0)
    const totalTokens = rows.reduce((s, r) => s + r.totalTokens, 0)
    const totalCostUsd = rows.reduce((s, r) => s + r.estimatedCostUsd, 0)

    return {
      byModel: rows,
      topTools,
      totalRuns,
      totalSuccessRuns,
      totalTokens,
      totalCostUsd,
      periodDays: days
    }
  }

  private _emptyMetrics(days: number): AgentMetrics {
    return {
      byModel: [],
      topTools: [],
      totalRuns: 0,
      totalSuccessRuns: 0,
      totalTokens: 0,
      totalCostUsd: 0,
      periodDays: days
    }
  }
}

function mergeAgentMetrics(trace: AgentMetrics, logs: AgentMetrics, days: number): AgentMetrics {
  const modelKeys = new Set([
    ...trace.byModel.map((r) => r.model),
    ...logs.byModel.map((r) => r.model)
  ])
  const traceByModel = new Map(trace.byModel.map((r) => [r.model, r]))
  const logsByModel = new Map(logs.byModel.map((r) => [r.model, r]))

  const byModel: AgentMetricRow[] = []
  for (const model of modelKeys) {
    const t = traceByModel.get(model)
    const l = logsByModel.get(model)
    if (!t && !l) continue

    const runs = Math.max(t?.runs ?? 0, l?.runs ?? 0)
    const successRuns = Math.max(t?.successRuns ?? 0, l?.successRuns ?? 0)
    const totalMs =
      (t?.avgDurationMs ?? 0) * (t?.successRuns ?? 0) ||
      (l?.avgDurationMs ?? 0) * (l?.successRuns ?? 0)
    const successForAvg = Math.max(t?.successRuns ?? 0, l?.successRuns ?? 0, 1)
    const totalTokens = (t?.totalTokens ?? 0) > 0 ? t!.totalTokens : (l?.totalTokens ?? 0)
    const toolCalls =
      (t?.toolCalls ?? 0) > 0 ? t!.toolCalls : model === 'unknown' ? 0 : (l?.toolCalls ?? 0)
    const estimatedCostUsd =
      (t?.estimatedCostUsd ?? 0) > 0 ? t!.estimatedCostUsd : (l?.estimatedCostUsd ?? 0)

    byModel.push({
      model,
      runs,
      successRuns,
      avgDurationMs: runs > 0 ? Math.round(totalMs / successForAvg) : 0,
      totalTokens,
      toolCalls,
      estimatedCostUsd
    })
  }

  byModel.sort((a, b) => b.runs - a.runs)

  const toolMap = new Map<string, number>()
  const topToolsSource = trace.topTools.length > 0 ? trace.topTools : logs.topTools
  for (const { tool, count } of topToolsSource) {
    toolMap.set(tool, count)
  }
  const topTools = Array.from(toolMap.entries())
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  const totalRuns = byModel.reduce((s, r) => s + r.runs, 0)
  const totalSuccessRuns = byModel.reduce((s, r) => s + r.successRuns, 0)
  const totalTokens = byModel.reduce((s, r) => s + r.totalTokens, 0)
  const totalCostUsd = byModel.reduce((s, r) => s + r.estimatedCostUsd, 0)

  return {
    byModel: byModel.filter((r) => r.model !== 'unknown' || r.runs > 0 || r.toolCalls > 0),
    topTools,
    totalRuns,
    totalSuccessRuns,
    totalTokens,
    totalCostUsd,
    periodDays: days
  }
}

export const agentLogger = new AgentLogger()
