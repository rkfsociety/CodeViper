import { useCallback, useEffect, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { makeId } from '../../shared/makeId'
import { compactToolChatLine } from '../../shared/toolDisplay'
import { sanitizeAssistantContent } from '../../shared/toolCalls'
import type { AgentContextPreview, ChatMessage } from '../types'
import type { GenerationMetrics } from '../../shared/generationMetrics'
import type { AgentPhase } from '../components/AgentStatusBar'

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
  setContextPreview
}: UseAgentStreamOptions) {
  const [draft, setDraft] = useState('')
  const [draftThinking, setDraftThinking] = useState('')
  const [agentPhase, setAgentPhase] = useState<AgentPhase>('thinking')
  const [activeToolName, setActiveToolName] = useState<string | undefined>()
  const [summarizing, setSummarizing] = useState(false)
  const [generationMetrics, setGenerationMetrics] = useState<GenerationMetrics | null>(null)
  const [runModel, setRunModel] = useState('')

  const lastAssistantContentRef = useRef('')
  const activeToolMessageIdRef = useRef<string | null>(null)

  const resetStreamState = useCallback(() => {
    setDraft('')
    setDraftThinking('')
    setAgentPhase('thinking')
    setActiveToolName(undefined)
    setSummarizing(false)
    setGenerationMetrics(null)
    activeToolMessageIdRef.current = null
    lastAssistantContentRef.current = ''
  }, [])

  useEffect(() => {
    const unsubscribe = window.codeviper.onAgentStream((event) => {
      if (event.chatId !== chatIdRef.current) return

      if (event.type === 'thinking') {
        setAgentPhase('thinking')
        setDraftThinking((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'token') {
        setAgentPhase('writing')
        setDraft((prev) => prev + (event.content ?? ''))
      }

      if (event.type === 'clear_draft') {
        setDraft('')
        setDraftThinking('')
      }

      if (event.type === 'assistant') {
        setDraft('')
        setDraftThinking('')
        const thinking = event.thinking?.trim() || undefined
        const cleaned = sanitizeAssistantContent(event.content ?? '')
        if (!cleaned || lastAssistantContentRef.current === cleaned) return
        lastAssistantContentRef.current = cleaned
        appendMessage({
          id: makeId(),
          role: 'assistant',
          content: cleaned,
          thinking,
          timestamp: Date.now()
        })
      }

      if (event.type === 'tool_start') {
        setDraft('')
        setDraftThinking('')
        setAgentPhase('tool')
        setActiveToolName(event.toolName)
        const id = makeId()
        activeToolMessageIdRef.current = id
        upsertMessage({
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
        const id = activeToolMessageIdRef.current ?? makeId()
        activeToolMessageIdRef.current = null
        upsertMessage({
          id,
          role: 'tool',
          content: compactToolChatLine(event.toolName, event.toolOutput, 'end'),
          toolName: event.toolName,
          toolOutput: event.toolOutput,
          timestamp: Date.now()
        })
      }

      if (event.type === 'error') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: event.content ?? '',
          timestamp: Date.now()
        })
      }

      if (event.type === 'learning_saved') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: `🧠 Запомнено: ${event.content ?? ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'skill_saved') {
        appendMessage({
          id: makeId(),
          role: 'system',
          content: `🛠️ Навык сохранён: ${event.content ?? ''}${event.skillId ? ` (${event.skillId})` : ''}`,
          timestamp: Date.now()
        })
        onLearningSavedRef.current?.()
      }

      if (event.type === 'self_improve_plan') {
        appendMessage({
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
        appendMessage({
          id: makeId(),
          role: 'system',
          content: event.content ?? `🤖 Модель: ${model}`,
          timestamp: Date.now()
        })
      }

      if (event.type === 'generation_metrics' && event.generationMetrics) {
        setGenerationMetrics(event.generationMetrics)
      }

      if (event.type === 'context') {
        if (typeof event.summarizing === 'boolean') {
          setSummarizing(event.summarizing)
        }
        if (event.contextPreview) {
          setContextPreview(event.contextPreview)
        } else if (event.content) {
          appendMessage({
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
        setDraft('')
        setDraftThinking('')
        setAgentPhase('thinking')
        setActiveToolName(undefined)
        setSummarizing(false)
        activeToolMessageIdRef.current = null
        void processNextQueuedRunRef.current()
      }
    })

    return unsubscribe
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — все зависимости через стабильные рефы

  return {
    draft,
    draftThinking,
    agentPhase,
    activeToolName,
    summarizing,
    generationMetrics,
    runModel,
    resetStreamState
  }
}
