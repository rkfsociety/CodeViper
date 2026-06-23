import { ModelRuntime } from './modelRuntime'
import type { ChatChunk } from '../../shared/modelProvider'

export interface BenchmarkRun {
  latencyMs: number
  tokens: number
  tps: number
}

export interface BenchmarkResult {
  model: string
  runs: BenchmarkRun[]
  avgLatencyMs: number
  avgTps: number
  toolCallOk: boolean
  error?: string
}

const BENCH_PROMPT = 'Count from 1 to 10, output only the numbers separated by spaces.'

const BENCH_TOOL = {
  name: 'benchmark_echo',
  description: 'Echo the input back.',
  input_schema: {
    type: 'object',
    properties: { message: { type: 'string' } },
    required: ['message']
  }
}

async function runTextBench(runtime: ModelRuntime, model: string): Promise<BenchmarkRun> {
  const t0 = Date.now()
  let tokens = 0
  let evalDurationNs = 0

  const gen = runtime.chat({
    model,
    messages: [{ role: 'user', content: BENCH_PROMPT }],
    max_tokens: 64,
    temperature: 0
  })

  for await (const chunk of gen as AsyncGenerator<ChatChunk>) {
    if (chunk.eval_count) tokens = chunk.eval_count
    if (chunk.eval_duration) evalDurationNs = chunk.eval_duration
  }

  const latencyMs = Date.now() - t0
  // Ollama eval_duration is in nanoseconds
  const tps =
    evalDurationNs > 0
      ? tokens / (evalDurationNs / 1e9)
      : tokens > 0
        ? tokens / (latencyMs / 1000)
        : 0

  return { latencyMs, tokens, tps: Math.round(tps * 10) / 10 }
}

async function runToolCallBench(runtime: ModelRuntime, model: string): Promise<boolean> {
  let accumulated = ''
  let hasToolCall = false

  try {
    const gen = runtime.chat({
      model,
      messages: [{ role: 'user', content: 'Use the benchmark_echo tool with message "hello".' }],
      tools: [BENCH_TOOL],
      tool_choice: 'auto',
      max_tokens: 128,
      temperature: 0
    })

    for await (const chunk of gen as AsyncGenerator<ChatChunk>) {
      if (chunk.tool_calls && chunk.tool_calls.length > 0) hasToolCall = true
      if (chunk.content) accumulated += chunk.content
    }

    if (!hasToolCall) {
      // Text-based tool calling: look for tool name in output
      hasToolCall = accumulated.includes('benchmark_echo')
    }
  } catch {
    hasToolCall = false
  }

  return hasToolCall
}

export async function runBenchmark(ollamaUrl: string, model: string): Promise<BenchmarkResult> {
  const runtime = new ModelRuntime({ type: 'ollama', baseUrl: ollamaUrl, model })

  const runs: BenchmarkRun[] = []

  try {
    // 3 text runs
    for (let i = 0; i < 3; i++) {
      runs.push(await runTextBench(runtime, model))
    }

    const avgLatencyMs = Math.round(runs.reduce((s, r) => s + r.latencyMs, 0) / runs.length)
    const avgTps = Math.round((runs.reduce((s, r) => s + r.tps, 0) / runs.length) * 10) / 10

    const toolCallOk = await runToolCallBench(runtime, model)

    return { model, runs, avgLatencyMs, avgTps, toolCallOk }
  } catch (err) {
    return {
      model,
      runs,
      avgLatencyMs: 0,
      avgTps: 0,
      toolCallOk: false,
      error: err instanceof Error ? err.message : String(err)
    }
  }
}
