import type { AttachmentReadResult } from '../../lib/attachmentHelpers'
import type { SlashCommand } from '../../../shared/slashCommands'
import { SlashCommandMenu } from '../SlashCommandMenu'
import { ChatInput as ChatInputField, type ChatInputHandle } from '../ChatInput'
import { FILE_LIMIT, formatSize } from './helpers'
import styles from '../ChatPanel.module.css'

export interface DroppedFile {
  name: string
  path: string
  size?: number
  /** Содержимое, прочитанное в renderer, если путь на диск недоступен */
  preloaded?: AttachmentReadResult
}

export interface ClipboardImage {
  name: string
  dataUrl: string
}

interface Props {
  chatId: string | null
  projectPath: string | null
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
  onFocus: () => void
  onBlur: () => void
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  chatInputRef: React.RefObject<ChatInputHandle | null>
  agentRunning: boolean
  queueSize: number
  onStop: () => void
  onSend: () => void
  model: string
}

export { type ChatInputHandle }

export function ChatInputSection({
  chatId,
  projectPath,
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
  onFocus,
  onBlur,
  onKeyDown,
  chatInputRef,
  agentRunning,
  queueSize,
  onStop,
  onSend,
  model
}: Props) {
  const totalAttachments = droppedFiles.length + clipboardImages.length
  const totalFileSize = droppedFiles.reduce((s, f) => s + (f.size ?? 0), 0)

  return (
    <>
      {totalAttachments > 0 && (
        <div className={styles.fileChips}>
          {droppedFiles.map((f) => (
            <span key={f.path} className={styles.fileChip} title={f.path}>
              <span className={styles.fileChipName}>{f.name}</span>
              {f.size != null && <span className={styles.fileChipSize}>{formatSize(f.size)}</span>}
              <button
                type="button"
                className={styles.fileChipRemove}
                aria-label={`Убрать ${f.name}`}
                onClick={() => onRemoveFile(f.path)}
              >
                ✕
              </button>
            </span>
          ))}
          {clipboardImages.map((img) => (
            <span
              key={img.name}
              className={`${styles.fileChip} ${styles.fileChipImage}`}
              title={img.name}
            >
              <img src={img.dataUrl} alt={img.name} className={styles.fileChipThumb} />
              <span className={styles.fileChipName}>{img.name}</span>
              <button
                type="button"
                className={styles.fileChipRemove}
                aria-label={`Убрать ${img.name}`}
                onClick={() => onRemoveImage(img.name)}
              >
                ✕
              </button>
            </span>
          ))}
          <span className={styles.fileChipsSummary}>
            {totalAttachments}/{FILE_LIMIT}
            {totalFileSize > 0 && ` · ${formatSize(totalFileSize)}`}
          </span>
        </div>
      )}

      <div style={{ position: 'relative' }}>
        {slashMatches.length > 0 && inputFocused && (
          <SlashCommandMenu
            commands={slashMatches}
            selectedIndex={slashMenuIndex}
            onSelect={onSlashSelect}
          />
        )}
        <div
          className={`${styles.inputBox}${inputFocused ? ' ' + styles.inputBoxFocused : ''}${isDragOver ? ' ' + styles.inputBoxDragOver : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {isDragOver && (
            <div className={styles.dragOverlay} aria-hidden="true">
              Отпустите файл(ы)
            </div>
          )}
          <ChatInputField
            ref={chatInputRef}
            value={input}
            onChange={onInputChange}
            projectPath={projectPath ?? ''}
            focused={inputFocused}
            onKeyDown={onKeyDown}
            onPaste={onPaste}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder="Напиши задачу… (/ — промпты, @ — файлы)"
            disabled={!chatId}
            rows={3}
          />

          <div className={styles.inputActions}>
            <button
              type="button"
              className={styles.attachBtn}
              onClick={() => {
                void window.codeviper.selectFiles().then((entries) => {
                  if (!entries.length) return
                  onAddFiles(
                    entries.map((e) => ({
                      name: e.path.split(/[\\/]/).pop() ?? e.path,
                      path: e.path,
                      size: e.size
                    }))
                  )
                  chatInputRef.current?.focus()
                })
              }}
              disabled={!chatId}
              title="Прикрепить файл(ы)"
              aria-label="Прикрепить файл"
            >
              +
            </button>
            {(agentRunning || queueSize > 0) && (
              <button
                type="button"
                className={`${styles.stopBtn}`}
                onClick={onStop}
                title="Остановить агента"
              >
                ■ Стоп{queueSize > 0 ? ` (${queueSize})` : ''}
              </button>
            )}
            <button
              type="button"
              className={styles.sendBtn}
              onClick={onSend}
              disabled={!model || !chatId || !projectPath || !input.trim()}
              title={agentRunning ? 'В очередь' : 'Отправить (Enter)'}
            >
              ↑
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
