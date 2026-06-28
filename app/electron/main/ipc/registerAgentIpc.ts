import { ipcMain } from 'electron'
import { IPC, parseIpcArgs, Contracts } from '../../../shared/ipcContracts'
import { AgentRunner, fetchOllamaModels } from '../agent'
import { checkAgentPrerequisites } from '../agentPrerequisites'
import { formatPrerequisitesMessage } from '../../../shared/agentPrerequisites'
import { filterToolCallingModels } from '../../../shared/recommendedModels'
import { buildAgentContextPreview, summarizeChatHistory } from '../agentContext'
import { formatModelSwitchMessage, prepareOllamaModel } from '../modelRuntime'
import { selectModelForTask, shouldUseAutoModel } from '../../../shared/modelRouter'
import { startSystemStatsPush, stopSystemStatsPush } from '../systemStats'
import { setProgressTarget, clearProgress, setIndexProgressStreamer } from '../progress'
import { agentLogger } from '../agentLogger'
import { hasRunCheckpoint, rollbackRunCheckpoint } from '../runCheckpoint'
import { makeId } from '../../../shared/makeId'
import type { AgentSettings, ChatMessage } from '../../../src/types'
import type { IpcContext } from './ipcContext'

export function registerAgentIpc(ctx: IpcContext): void {
  const {
    getWindow,
    stream,
    agentRunStates,
    activeAgentAborts,
    pendingConfirms,
    pendingClarifies,
    pendingPlanConfirms,
    pendingPreviews,
    pendingHunkSelections,
    syncTrayAgentBadge,
    recordRun
  } = ctx

  function makePreviewFn(signal: AbortSignal): (previewId: string) => Promise<boolean> {
    return (previewId) =>
      new Promise<boolean>((resolve) => {
        const settle = (apply: boolean) => {
          pendingPreviews.delete(previewId)
          resolve(apply)
        }
        pendingPreviews.set(previewId, settle)
        signal.addEventListener('abort', () => settle(false), { once: true })
      })
  }

  function makePlanConfirmFn(
    signal: AbortSignal,
    chatId: string
  ): (plan: string) => Promise<boolean> {
    return (plan) =>
      new Promise<boolean>((resolve) => {
        const id = makeId()
        const settle = (approved: boolean) => {
          pendingPlanConfirms.delete(id)
          resolve(approved)
        }
        pendingPlanConfirms.set(id, settle)
        signal.addEventListener('abort', () => settle(false), { once: true })
        stream(chatId, { type: 'plan_awaiting_confirm', planConfirmId: id, content: plan })
      })
  }

  function makeClarifyFn(signal: AbortSignal): (question: string) => Promise<string | null> {
    return (question) =>
      new Promise<string | null>((resolve) => {
        const id = makeId()
        const settle = (answer: string | null) => {
          pendingClarifies.delete(id)
          resolve(answer)
        }
        pendingClarifies.set(id, settle)
        signal.addEventListener('abort', () => settle(null), { once: true })
        getWindow()?.webContents.send(IPC.AGENT_CLARIFY, { id, question })
      })
  }

  function makeConfirmFn(
    signal: AbortSignal
  ): (toolName: string, toolInput: string) => Promise<boolean> {
    return (toolName, toolInput) =>
      new Promise<boolean>((resolve) => {
        const id = makeId()
        const settle = (approved: boolean) => {
          pendingConfirms.delete(id)
          resolve(approved)
        }
        pendingConfirms.set(id, settle)
        signal.addEventListener('abort', () => settle(false), { once: true })
        getWindow()?.webContents.send('agent-confirm', { id, toolName, toolInput })
      })
  }

  ipcMain.handle('get-agent-run-state', async () => Array.from(agentRunStates.keys()))

  ipcMain.handle('stop-agent', async (_e, chatId: string) => {
    const abort = activeAgentAborts.get(chatId)
    if (!abort) return false
    abort.abort()
    return true
  })

  ipcMain.handle(IPC.GET_RUN_CHECKPOINT, async (_e, ...a) => {
    const [chatId] = parseIpcArgs(Contracts[IPC.GET_RUN_CHECKPOINT].args, a)
    return hasRunCheckpoint(chatId)
  })

  ipcMain.handle(IPC.ROLLBACK_RUN, async (_e, ...a) => {
    const [chatId] = parseIpcArgs(Contracts[IPC.ROLLBACK_RUN].args, a)
    const result = await rollbackRunCheckpoint(chatId)
    if (result.ok) {
      stream(chatId, { type: 'run_checkpoint', runCheckpointActive: false })
    }
    return result
  })

  ipcMain.on(IPC.AGENT_CONFIRM_RESPONSE, (_e, id: string, approved: boolean) => {
    const resolve = pendingConfirms.get(id)
    if (resolve) {
      pendingConfirms.delete(id)
      resolve(approved)
    }
  })

  ipcMain.on(IPC.AGENT_CLARIFY_RESPONSE, (_e, id: string, answer: string | null) => {
    const resolve = pendingClarifies.get(id)
    if (resolve) {
      pendingClarifies.delete(id)
      resolve(answer)
    }
  })

  ipcMain.on(IPC.AGENT_PLAN_CONFIRM_RESPONSE, (_e, id: string, approved: boolean) => {
    const resolve = pendingPlanConfirms.get(id)
    if (resolve) {
      pendingPlanConfirms.delete(id)
      resolve(approved)
    }
  })

  ipcMain.on(IPC.AGENT_PREVIEW_RESPONSE, (_e, id: string, apply: boolean) => {
    const resolve = pendingPreviews.get(id)
    if (resolve) {
      pendingPreviews.delete(id)
      resolve(apply)
    }
  })

  ipcMain.on(IPC.AGENT_PREVIEW_HUNK_SELECTION, (_e, id: string, selectedIndices: number[]) => {
    pendingHunkSelections.set(id, selectedIndices)
  })

  ipcMain.handle(
    'preview-agent-context',
    async (_e, projectPath: string, history: ChatMessage[], userMessage: string, model: string) =>
      buildAgentContextPreview(projectPath, history, userMessage, model, false, {
        uiPreviewOnly: true
      })
  )

  ipcMain.handle(
    'summarize-context',
    async (_e, chatMessages: ChatMessage[], settings: AgentSettings) =>
      summarizeChatHistory(chatMessages, settings)
  )

  ipcMain.handle(
    'run-agent',
    async (
      _e,
      settings: AgentSettings,
      projectPath: string,
      chatId: string,
      history: ChatMessage[],
      userMessage: string,
      incognito?: boolean,
      userImages?: { name: string; dataUrl: string }[]
    ) => {
      if (agentRunStates.has(chatId)) {
        throw new Error('Агент уже выполняет задачу в этом чате. Дождитесь завершения.')
      }

      recordRun()
      agentLogger.setIncognito(incognito ?? false)

      const abortCtrl = new AbortController()
      agentRunStates.set(chatId, { chatId, projectPath })
      activeAgentAborts.set(chatId, abortCtrl)
      syncTrayAgentBadge()
      if (!settings.disableSystemStats) startSystemStatsPush(_e.sender)
      setProgressTarget(_e.sender)
      setIndexProgressStreamer((percent) => {
        stream(chatId, { type: 'index_progress', indexPercent: percent })
      })

      const skipOllama = (settings.modelProvider ?? 'ollama') !== 'ollama'
      const prerequisites = await checkAgentPrerequisites(
        settings.ollamaUrl,
        projectPath,
        skipOllama
      )
      if (!prerequisites.ok) {
        stream(chatId, {
          type: 'error',
          content: formatPrerequisitesMessage(prerequisites.issues)
        })
        stream(chatId, { type: 'done' })
        activeAgentAborts.delete(chatId)
        agentRunStates.delete(chatId)
        syncTrayAgentBadge()
        clearProgress()
        setProgressTarget(null)
        setIndexProgressStreamer(null)
        return
      }

      let effectiveSettings = settings

      try {
        const isCloudProvider = (settings.modelProvider ?? 'ollama') !== 'ollama'

        let installed: Awaited<ReturnType<typeof fetchOllamaModels>> = []
        if (!isCloudProvider) {
          installed = await fetchOllamaModels(settings.ollamaUrl)
          const toolInstalled = filterToolCallingModels(installed)
          const useAuto = shouldUseAutoModel(settings.autoModel, toolInstalled.length)

          if (useAuto) {
            const selection = selectModelForTask(userMessage, toolInstalled, settings.model)
            if (selection) {
              const { unloaded } = await prepareOllamaModel(settings.ollamaUrl, selection.model)
              effectiveSettings = { ...settings, model: selection.model }
              stream(chatId, {
                type: 'model_selected',
                selectedModel: selection.model,
                modelReason: selection.reason,
                content: formatModelSwitchMessage(selection.model, selection.reason, unloaded)
              })
            } else if (!settings.model.trim() && toolInstalled[0]) {
              effectiveSettings = { ...settings, model: toolInstalled[0].name }
            }
          } else if (!effectiveSettings.model.trim() && toolInstalled[0]) {
            effectiveSettings = { ...settings, model: toolInstalled[0].name }
          }
        }

        if (!effectiveSettings.model.trim()) {
          throw new Error('Модель не выбрана. Скачайте модель в настройках или включите Ollama.')
        }

        const runner = new AgentRunner({
          settings: effectiveSettings,
          projectPath,
          emit: (event) => stream(chatId, event),
          signal: abortCtrl.signal,
          confirm: makeConfirmFn(abortCtrl.signal),
          clarify: makeClarifyFn(abortCtrl.signal),
          confirmPlan: makePlanConfirmFn(abortCtrl.signal, chatId),
          previewFn: makePreviewFn(abortCtrl.signal),
          chatId,
          hunkSelectionFn: (previewId) => {
            const sel = pendingHunkSelections.get(previewId)
            pendingHunkSelections.delete(previewId)
            return sel
          }
        })

        await runner.run(history, userMessage, userImages)
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'AbortError')) {
          stream(chatId, {
            type: 'error',
            content: error instanceof Error ? error.message : String(error)
          })
          stream(chatId, { type: 'done' })
        }
      } finally {
        agentLogger.setIncognito(false)
        stopSystemStatsPush()
        clearProgress()
        setProgressTarget(null)
        setIndexProgressStreamer(null)
        activeAgentAborts.delete(chatId)
        agentRunStates.delete(chatId)
        syncTrayAgentBadge()
      }
    }
  )
}
