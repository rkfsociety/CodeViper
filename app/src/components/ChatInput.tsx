import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent
} from 'react'
import {
  filterFileMentionPaths,
  flattenFileTree,
  getActiveFileMention,
  insertFileMention,
  type FileMentionItem
} from '../../shared/fileMentions'
import { FileMentionPopover } from './FileMentionPopover'

export interface ChatInputHandle {
  focus: () => void
  getTextarea: () => HTMLTextAreaElement | null
}

interface Props {
  value: string
  onChange: (value: string) => void
  projectPath: string
  disabled?: boolean
  placeholder?: string
  rows?: number
  focused?: boolean
  onFocus?: () => void
  onBlur?: () => void
  onPaste?: (e: ClipboardEvent<HTMLTextAreaElement>) => void
  onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void
  mentionMenuOpenRef?: React.MutableRefObject<boolean>
}

export const ChatInput = forwardRef<ChatInputHandle, Props>(function ChatInput(
  {
    value,
    onChange,
    projectPath,
    disabled,
    placeholder,
    rows = 3,
    focused,
    onFocus,
    onBlur,
    onPaste,
    onKeyDown,
    mentionMenuOpenRef
  },
  ref
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const cursorRef = useRef(0)
  const prevMentionQueryRef = useRef<string | null>(null)
  const [mentionRevision, setMentionRevision] = useState(0)
  const [mentionIndex, setMentionIndex] = useState(0)
  const [projectFiles, setProjectFiles] = useState<FileMentionItem[]>([])

  const bumpMentionRevisionIfNeeded = useCallback((text: string, cursorPos: number) => {
    const mention = getActiveFileMention(text, cursorPos)
    const query = mention?.query ?? null
    if (query !== prevMentionQueryRef.current) {
      prevMentionQueryRef.current = query
      setMentionRevision((n) => n + 1)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    getTextarea: () => textareaRef.current
  }))

  useEffect(() => {
    if (!projectPath.trim()) {
      setProjectFiles([])
      return
    }
    let cancelled = false
    void window.codeviper.getProjectTree(projectPath, 8).then((tree) => {
      if (!cancelled) setProjectFiles(flattenFileTree(tree))
    })
    return () => {
      cancelled = true
    }
  }, [projectPath])

  const activeMention = useMemo(() => {
    if (!projectPath.trim() || !focused) return null
    void mentionRevision
    return getActiveFileMention(value, cursorRef.current)
  }, [value, projectPath, focused, mentionRevision])

  const mentionMatches = useMemo(() => {
    if (!activeMention || !projectFiles.length) return []
    return filterFileMentionPaths(projectFiles, activeMention.query)
  }, [activeMention, projectFiles])

  const mentionOpen = Boolean(activeMention && projectPath.trim())

  useEffect(() => {
    if (mentionMenuOpenRef) mentionMenuOpenRef.current = mentionOpen
  }, [mentionOpen, mentionMenuOpenRef])

  useEffect(() => {
    setMentionIndex(0)
  }, [activeMention?.query, mentionMatches.length])

  const syncCursor = useCallback(() => {
    const pos = textareaRef.current?.selectionStart ?? value.length
    cursorRef.current = pos
    bumpMentionRevisionIfNeeded(value, pos)
  }, [value, bumpMentionRevisionIfNeeded])

  const applyMention = useCallback(
    (item: FileMentionItem) => {
      if (!activeMention) return
      const { value: next, cursor: nextCursor } = insertFileMention(
        value,
        activeMention.start,
        cursorRef.current,
        item.relativePath
      )
      onChange(next)
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
        textareaRef.current?.setSelectionRange(nextCursor, nextCursor)
        cursorRef.current = nextCursor
        bumpMentionRevisionIfNeeded(next, nextCursor)
      })
    },
    [activeMention, bumpMentionRevisionIfNeeded, onChange, value]
  )

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionOpen && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setMentionIndex((i) => Math.min(i + 1, mentionMatches.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setMentionIndex((i) => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey)) {
        e.preventDefault()
        const item = mentionMatches[mentionIndex]
        if (item) applyMention(item)
        return
      }
    }

    if (mentionOpen && e.key === 'Escape') {
      e.preventDefault()
      if (!activeMention) return
      const next = `${value.slice(0, activeMention.start)}${value.slice(cursorRef.current)}`
      onChange(next)
      requestAnimationFrame(() => {
        textareaRef.current?.setSelectionRange(activeMention.start, activeMention.start)
        cursorRef.current = activeMention.start
        bumpMentionRevisionIfNeeded(next, activeMention.start)
      })
      return
    }

    onKeyDown?.(e)
  }

  return (
    <>
      {mentionOpen && (
        <FileMentionPopover
          items={mentionMatches}
          selectedIndex={mentionIndex}
          onSelect={applyMention}
        />
      )}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          const nextValue = e.target.value
          const pos = e.target.selectionStart ?? nextValue.length
          cursorRef.current = pos
          onChange(nextValue)
          bumpMentionRevisionIfNeeded(nextValue, pos)
        }}
        onClick={syncCursor}
        onKeyUp={syncCursor}
        onSelect={syncCursor}
        onKeyDown={handleKeyDown}
        onPaste={onPaste}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        disabled={disabled}
        rows={rows}
      />
    </>
  )
})
