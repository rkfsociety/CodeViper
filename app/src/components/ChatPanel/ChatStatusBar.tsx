import type {
  AgentSettings,
  AgentContextPreview,
  OllamaModel,
  ProgressInfo,
  SelfImprovementPlanItem,
  TodoItem
} from '../../types'
import { AgentStatusBar } from '../AgentStatusBar'
import { TodoPanel } from '../TodoPanel'
import { SelfImprovePlanPanel } from '../SelfImprovePlanPanel'
import { AgentLearningPanel } from '../AgentLearningPanel'
import { ProjectRulesPanel } from '../ProjectRulesPanel'
import { RoadmapPickerPanel } from '../RoadmapPickerPanel'
import { QuickPromptBar } from '../QuickPromptBar'
import { RunRollbackButton } from '../RunRollbackButton'
import type { ClipboardImage, DroppedFile } from './ChatInput'
import { ChatInputSection } from './ChatInput'
import { ChatInputMeta } from './ChatInputMeta'
import type { ChatInputHandle } from '../ChatInput'
import type { SlashCommand } from '../../../shared/slashCommands'
import styles from '../ChatPanel.module.css'

interface Props {
  chatId: string | null
  projectPath: string | null
  settings: AgentSettings
  busy: boolean
  agentRunning: boolean
  queueSize: number
  progress: ProgressInfo | null
  indexingProgress: ProgressInfo | null
  p2pCredits: number | null
  runModel: string
  displayModels: OllamaModel[]
  planItems: SelfImprovementPlanItem[] | null
  todoItems: TodoItem[] | null
  todoTitle: string | undefined
  showLearningPanel: boolean
  showRulesPanel: boolean
  showRoadmapPanel: boolean
  showQuickBar: boolean
  modelPickerOpen: boolean
  modelPickerRef: React.RefObject<HTMLDivElement | null>
  contextPopoverOpen: boolean
  contextPopoverRef: React.RefObject<HTMLDivElement | null>
  contextPreview: AgentContextPreview | null
  contextLoading: boolean
  summarizing: boolean
  projectLocked: boolean
  // input zone
  input: string
  onInputChange: (v: string) => void
  droppedFiles: DroppedFile[]
  clipboardImages: ClipboardImage[]
  isDragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
  onDrop: (e: React.DragEvent) => void
  onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void
  onRemoveFile: (path: string) => void
  onRemoveImage: (name: string) => void
  onAddFiles: (entries: DroppedFile[]) => void
  slashMatches: SlashCommand[]
  slashMenuIndex: number
  onSlashSelect: (cmd: SlashCommand) => void
  inputFocused: boolean
  onInputFocus: () => void
  onInputBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  chatInputRef: React.RefObject<ChatInputHandle | null>
  onStop: () => void
  onSend: () => void
  // callbacks
  onSetPlanItems: (items: SelfImprovementPlanItem[] | null) => void
  onSetTodoItems: (items: TodoItem[] | null) => void
  onSetShowLearning: (v: boolean) => void
  onSetShowRules: (v: boolean) => void
  onSetShowRoadmap: (v: boolean) => void
  onSetShowQuickBar: (v: boolean) => void
  onSetModelPickerOpen: (v: boolean) => void
  onSetContextPopoverOpen: (v: boolean) => void
  onSetContextModalOpen: (v: boolean) => void
  onInsertPrompt: (text: string) => void
  onModelChange?: (model: string, auto: boolean) => void
  onSettingsChange?: (partial: Partial<AgentSettings>) => void
  onPickProject: () => void
  onOpenRecentProject?: (path: string) => void
  onSummarizeContext: () => Promise<void>
  onRollback: (message: string) => void
}

export function ChatStatusBar({
  chatId,
  projectPath,
  settings,
  busy,
  agentRunning,
  queueSize,
  progress,
  indexingProgress,
  p2pCredits,
  runModel,
  displayModels,
  planItems,
  todoItems,
  todoTitle,
  showLearningPanel,
  showRulesPanel,
  showRoadmapPanel,
  showQuickBar,
  modelPickerOpen,
  modelPickerRef,
  contextPopoverOpen,
  contextPopoverRef,
  contextPreview,
  contextLoading,
  summarizing,
  projectLocked,
  input,
  onInputChange,
  droppedFiles,
  clipboardImages,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onPaste,
  onRemoveFile,
  onRemoveImage,
  onAddFiles,
  slashMatches,
  slashMenuIndex,
  onSlashSelect,
  inputFocused,
  onInputFocus,
  onInputBlur,
  onKeyDown,
  chatInputRef,
  onStop,
  onSend,
  onSetPlanItems,
  onSetTodoItems,
  onSetShowLearning,
  onSetShowRules,
  onSetShowRoadmap,
  onSetShowQuickBar,
  onSetModelPickerOpen,
  onSetContextPopoverOpen,
  onSetContextModalOpen,
  onInsertPrompt,
  onModelChange,
  onSettingsChange,
  onPickProject,
  onOpenRecentProject,
  onSummarizeContext,
  onRollback
}: Props) {
  return (
    <div className={styles.input}>
      {(busy || indexingProgress) && (
        <AgentStatusBar
          model={settings.model}
          queueSize={queueSize}
          progress={busy ? progress : indexingProgress}
          p2pCredits={p2pCredits}
        />
      )}

      {planItems && planItems.length > 0 && (
        <SelfImprovePlanPanel items={planItems} onClose={() => onSetPlanItems(null)} />
      )}

      {todoItems && todoItems.length > 0 && (
        <TodoPanel items={todoItems} title={todoTitle} onClose={() => onSetTodoItems(null)} />
      )}

      {showLearningPanel && <AgentLearningPanel onClose={() => onSetShowLearning(false)} />}

      {showRulesPanel && projectPath && (
        <ProjectRulesPanel projectPath={projectPath} onClose={() => onSetShowRules(false)} />
      )}

      {showRoadmapPanel && chatId && projectPath && (
        <RoadmapPickerPanel
          onSelect={(prompt) => {
            onInsertPrompt(prompt)
            onSetShowRoadmap(false)
          }}
          onClose={() => onSetShowRoadmap(false)}
        />
      )}

      {showQuickBar && chatId && projectPath && (
        <QuickPromptBar
          onInsert={(text) => {
            onInsertPrompt(text)
            onSetShowQuickBar(false)
          }}
          disabled={!chatId || !projectPath}
        />
      )}

      <ChatInputSection
        chatId={chatId}
        projectPath={projectPath}
        input={input}
        onInputChange={onInputChange}
        droppedFiles={droppedFiles}
        clipboardImages={clipboardImages}
        isDragOver={isDragOver}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onPaste={onPaste}
        onRemoveFile={onRemoveFile}
        onRemoveImage={onRemoveImage}
        onAddFiles={onAddFiles}
        slashMatches={slashMatches}
        slashMenuIndex={slashMenuIndex}
        onSlashSelect={onSlashSelect}
        inputFocused={inputFocused}
        onFocus={onInputFocus}
        onBlur={onInputBlur}
        onKeyDown={onKeyDown}
        chatInputRef={chatInputRef}
        agentRunning={agentRunning}
        queueSize={queueSize}
        onStop={onStop}
        onSend={onSend}
        model={settings.model}
      />

      {chatId && (
        <div className={styles.permissionModeBar}>
          <div className={styles.permissionModes}>
            <button
              type="button"
              className={`${styles.permModeBtn}${settings.permissionMode === 'ask' ? ' ' + styles.permModeBtnActive : ''}`}
              title="Спрашивать перед каждым действием"
              onClick={() => onSettingsChange?.({ permissionMode: 'ask' })}
            >
              Ask
            </button>
            <button
              type="button"
              className={`${styles.permModeBtn}${settings.permissionMode === 'acceptEdits' ? ' ' + styles.permModeBtnActive : ''}`}
              title="Автоматически применять правки"
              onClick={() => onSettingsChange?.({ permissionMode: 'acceptEdits' })}
            >
              Accept
            </button>
            <button
              type="button"
              className={`${styles.permModeBtn}${settings.permissionMode === 'bypass' ? ' ' + styles.permModeBtnActive : ''}`}
              title="Полная автономия"
              onClick={() => onSettingsChange?.({ permissionMode: 'bypass' })}
            >
              Bypass
            </button>
          </div>
          <RunRollbackButton
            chatId={chatId}
            projectPath={projectPath ?? ''}
            disabled={busy}
            onRollback={(message) => onRollback(message)}
          />
        </div>
      )}

      {chatId && (
        <ChatInputMeta
          projectPath={projectPath}
          recentProjects={settings.recentProjects}
          settings={settings}
          busy={busy}
          runModel={runModel}
          displayModels={displayModels}
          showLearningPanel={showLearningPanel}
          showRulesPanel={showRulesPanel}
          showRoadmapPanel={showRoadmapPanel}
          showQuickBar={showQuickBar}
          modelPickerOpen={modelPickerOpen}
          modelPickerRef={modelPickerRef}
          contextPopoverOpen={contextPopoverOpen}
          contextPopoverRef={contextPopoverRef}
          contextPreview={contextPreview}
          contextLoading={contextLoading}
          summarizing={summarizing}
          projectLocked={projectLocked}
          onSetShowLearning={onSetShowLearning}
          onSetShowRules={onSetShowRules}
          onSetShowRoadmap={onSetShowRoadmap}
          onSetShowQuickBar={onSetShowQuickBar}
          onSetModelPickerOpen={onSetModelPickerOpen}
          onSetContextPopoverOpen={onSetContextPopoverOpen}
          onSetContextModalOpen={onSetContextModalOpen}
          onModelChange={onModelChange}
          onPickProject={onPickProject}
          onOpenRecentProject={onOpenRecentProject}
          onSummarizeContext={onSummarizeContext}
        />
      )}
    </div>
  )
}
