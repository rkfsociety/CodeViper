import type { AgentTraceEvent } from '../src/types'
import { estimateRequestCost, findModelPricing } from './constants'

export interface TraceMetricRow {
  runs: number
  successRuns: number
  totalMs: number
  totalTokens: number
  toolCalls: number
  costUsd: number
}

export interface TraceMetricsAggregate {
  byModel: Map<string, TraceMetricRow>
  toolCount: Map<string, number>
}

function emptyRow(): TraceMetricRow {
  return {
    runs: 0,
    successRuns: 0,
    totalMs: 0,
    totalTokens: 0,
    toolCalls: 0,
    costUsd: 0
  }
}

function getOrCreate(map: Map<string, TraceMetricRow>, model: string): TraceMetricRow {
  let row = map.get(model)
  if (!row) {
    row = emptyRow()
    map.set(model, row)
  }
  return row
}

function num(data: Record<string, unknown>, key: string): number | undefined {
  const v = data[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined
}

function estimateRunCost(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = findModelPricing(model)
  if (!pricing) return 0
  return estimateRequestCost(pricing, inputTokens, outputTokens, 0)
}

/** Агрегирует метрики из событий трейса агента за период (cutoffTs — нижняя граница ts). */
export function aggregateTraceEvents(
  events: AgentTraceEvent[],
  cutoffTs: number
): TraceMetricsAggregate {
  const byModel = new Map<string, TraceMetricRow>()
  const toolCount = new Map<string, number>()

  let currentModel = 'unknown'
  let runLlmTokens = 0
  let runInputTokens = 0
  let runOutputTokens = 0

  const sorted = [...events].sort((a, b) => a.ts - b.ts)

  for (const ev of sorted) {
    if (ev.ts < cutoffTs) continue
    const data = ev.data ?? {}

    switch (ev.kind) {
      case 'run_start': {
        currentModel = (typeof data.model === 'string' && data.model.trim()) || 'unknown'
        runLlmTokens = 0
        runInputTokens = 0
        runOutputTokens = 0
        getOrCreate(byModel, currentModel).runs++
        break
      }
      case 'llm_response': {
        const tokens = num(data, 'tokens') ?? 0
        if (tokens > 0) runLlmTokens += tokens
        runInputTokens += num(data, 'inputTokens') ?? 0
        runOutputTokens += num(data, 'outputTokens') ?? 0
        break
      }
      case 'tool_call': {
        const tool = (typeof data.tool === 'string' && data.tool.trim()) || 'unknown'
        toolCount.set(tool, (toolCount.get(tool) ?? 0) + 1)
        getOrCreate(byModel, currentModel).toolCalls++
        break
      }
      case 'run_end': {
        const row = getOrCreate(byModel, currentModel)
        const durationMs = num(data, 'durationMs') ?? 0
        row.totalMs += durationMs
        const status = data.status
        if (!status || status === 'ok') row.successRuns++

        const sessionTokens = num(data, 'sessionTokens') ?? 0
        const sessionCostUsd = num(data, 'sessionCostUsd') ?? 0
        if (sessionTokens > 0) {
          row.totalTokens += sessionTokens
        } else if (runLlmTokens > 0) {
          row.totalTokens += runLlmTokens
        }

        if (sessionCostUsd > 0) {
          row.costUsd += sessionCostUsd
        } else if (runInputTokens > 0 || runOutputTokens > 0) {
          row.costUsd += estimateRunCost(currentModel, runInputTokens, runOutputTokens)
        } else {
          const tokForCost = sessionTokens > 0 ? sessionTokens : runLlmTokens
          if (tokForCost > 0) {
            row.costUsd += estimateRunCost(currentModel, 0, tokForCost)
          }
        }

        runLlmTokens = 0
        runInputTokens = 0
        runOutputTokens = 0
        break
      }
      default:
        break
    }
  }

  return { byModel, toolCount }
}
