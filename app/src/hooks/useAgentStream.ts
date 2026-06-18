import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { makeId } from '../../shared/makeId'
import { compactToolChatLine } from '../../shared/toolDisplay'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentContextPreview, ChatMessage } from '../types'
import type { GenerationMetrics, RunStats } from '../../shared/generationMetrics'
import type { AgentPhase } from '../components/AgentStatusBar'

export type { RunStats }

export interface UseAgentStreamOptions {
  chatIdRef: MutableRefObject<string | null>
  runIdRef: MutableRefObject<number>
  doneRunIdRef: MutableRefObject<number>
  onLearningSavedRef: MutableRefObject<(() => void) | undefined>
  onActiveModelChangeRef: MutableRefObject<((model: string) => void) | undefined>
  processNextQueuedRunRef: MutableRefObject<() => Promise<void>>
  appendMessage: (message: ChatMessage) => void
  upsertMessage: (message: ChatMessage) => void
  setContextPreview: (preview: AgentContextPreview | null) => void
  onAgentDoneRef?: MutableRefObject<(() => void) | undefined>
}

export function useAgentStream({
  chatIdRef,
  runIdRef,
  doneRunIdRef,
  onLearningSavedRef,
  onActiveModelChangeRef,
  processNextQueuedRunRef,
  appendMessage,
  upsertMessage,
  setContextPreview,
  onAgentDoneRef
}: UseAgentStreamOptions) {
  const [draft, setDraft] = useState('')
  const [draftThinking, setDraftThinking] = useState('')
  const draftRef = useRef('')
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('thinking')
  const [activeToolName, setActiveToolName] = useState<string | undefined>()
  const [summarizing, setSummarizing] = useState(false)
  const [generationMetrics, setGenerationMetrics] = useState<GenerationMetrics | null>(null)
  const [runModel, setRunModel] = useState('')
  const [runStats, setRunStats] = useState<RunStats | null>(null)

  const lastAssistantContentRef = useRef('')
  const activeToolMessageIdRef = useRef<string | null>(null)
  const activeToolNameRef = useRef<string | undefined>(undefined)
  const genStartRef = useRef<number | null>(null)
  const runStartRef = useRef<number | null>(null)
  const cumulativeTokensRef = useRef(0)
  const runActiveRef = useRef(false)

  // Task 23: wrap mutable callbacks in refs so the single useEffect closure never goes stale
  const appendMessageRef = useRef(appendMessage)
  const upsertMessageRef = useRef(upsertMessage)
  const setContextPreviewRef = useRef(setContextPreview)
  appendMessageRef.current = appendMessage
  upsertMessageRef.current = upsertMessage
  setContextPreviewRef.current = setContextPreview

  const resetStreamState = useCallback(() => {
    setDraft('')
    setDraftThinking('')
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    setSummarizing(false)
    setGenerationMetrics(null)
    setRunStats(null)
    activeToolMessageIdRef.current = null
    activeToolNameRef.current = undefined
    lastAssistantContentRef.current = ''
    genStartRef.current = null
    runStartRef.current = Date.now()
    cumulativeTokensRef.current = 0
    runActiveRef.current = true
  }, [])

  // Тикает каждую секунду пока агент работает — обновляет elapsed в runStats
  useEffect(() => {
    const interval = setInterval(() => {
      if (!runActiveRef.current || runStartRef.current === null) return
      const elapsed = Math.floor((Date.now() - runStartRef.current) / 1000)
      setRunStats({ elapsedSec: elapsed, tokens: cumulativeTokensRef.current })
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return

      if (event.type === 'thinking') {
        setAgentPhase('thinking')
        if (genStartRef.current === null) genStartRef.current = Date.now()
        setDraftThinking((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'token') {
        setAgentPhase('writing')
        if (genStartRef.current === null) genStartRef.current = Date.now()
        setDraft((prev) => {
          const next = prev + (event.content ?? '')
          draftRef.current = next
          return next
        })
      }

      if (event.type === 'clear_draft') {
        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        genStartRef.current = null
      }

      if (event.type === 'assistant') {
        const durationMs =
          genStartRef.current != null ? Date.now() - genStartRef.current : undefined
        genStartRef.current = null
        setDraft('')
        setDraftThinking('')
        const thinking = event.thinking?.trim() || undefined
        const cleaned = sanitizeAssistantContent(event.content ?? '')
        if (!cleaned || lastAssistantContentRef.current === cleaned) return
        lastAssistantContentRef.current = cleaned
        appendMessageRef.current({
          id: makeId(),
          role: 'assistant',
          content: cleaned,
          thinking,
          timestamp: Date.now(),
          durationMs
        })
      }

      if (event.type === 'tool_start') {
        genStartRef.current = null
        setDraft('')
        setDraftThinking('')
        setAgentPhase('tool')
        setActiveToolName(event.toolName)
        activeToolNameRef.current = event.toolName
        const id = makeId()
        activeToolMessageIdRef.current = id
        upsertMessageRef.current({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, undefined, 'start'),
          toolName: event.toolName,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_end') {
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        activeToolNameRef.current = undefined
        const id = activeToolMessageIdRef.current ?? makeId()
        activeToolMessageIdRef.current = null
        upsertMessageRef.current({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, event.toolOutput, 'end'),
          toolName: event.toolName,
          toolOutput: event.toolOutput,
          timestamp: Date.now()
        })
      }

      if (event.type === 'error') {
        runActiveRef.current = false
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
        // Task 24: error means the run is ending — continue the queue
        const runId = runIdRef.current
        if (doneRunIdRef.current !== runId) {
          doneRunIdRef.current = runId
          void processNextQueuedRunRef.current()
        }
      }

      if (event.type === 'learning_saved') {
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: `🧠 Запомнено: ${event.content ?? ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'skill_saved') {
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: `🛠️ Навык сохранён: ${event.content ?? ''}${event.skillId ? ` (${event.skillId})` : ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'self_improve_plan') {
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
      }

      if (event.type === 'model_selected') {
        const model = event.selectedModel ?? ''
        if (model) {
          setRunModel(model)
          onActiveModelChangeRef.current?.(model)
        }
        appendMessageRef.current({
          id: makeId(),
          role: 'system',
          content: event.content ?? `🤖 Модель: ${model}`,
          timestamp: Date.now()
        })
      }

      if (event.type === 'generation_metrics' && event.generationMetrics) {
        setGenerationMetrics(event.generationMetrics)
        const m = event.generationMetrics
        // Для Ollama накапливаем evalCount; для cloud берём sessionTokens напрямую
        if (m.sessionTokens != null) {
          cumulativeTokensRef.current = m.sessionTokens
        } else {
          cumulativeTokensRef.current += m.evalCount
        }
      }

      if (event.type === 'context') {
        if (typeof event.summarizing === 'boolean') {
          setSummarizing(event.summarizing)
        }
        if (event.contextPreview) {
          setContextPreviewRef.current(event.contextPreview)
        } else if (event.content) {
          appendMessageRef.current({
            id: makeId(),
            role: 'system',
            content: event.content,
            timestamp: Date.now()
          })
        }
      }

      if (event.type === 'done') {
        const runId = runIdRef.current
        if (doneRunIdRef.current === runId) return
        doneRunIdRef.current = runId
        // Task 28: finalize incomplete tool_start without matching tool_end
        if (activeToolMessageIdRef.current) {
          const name = activeToolNameRef.current ?? ''
          upsertMessageRef.current({
            id: activeToolMessageIdRef.current,
            role: 'tool',
            content: compactToolChatLine(name, '⚠️ Прервано', 'end'),
            toolName: name,
            timestamp: Date.now()
          })
          activeToolMessageIdRef.current = null
          activeToolNameRef.current = undefined
        }
        setDraft('')
        setDraftThinking('')
        draftRef.current = ''
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        setSummarizing(false)
        genStartRef.current = null
        runActiveRef.current = false
        onAgentDoneRef?.current?.()
        void processNextQueuedRunRef.current()
      }
    })

    return unsubscribe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps -- все зависимости через стабильные рефы

  return {
    draft,
    draftThinking,
    draftRef,
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
    runStats,
    resetStreamState
  }
}
