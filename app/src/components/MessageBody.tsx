import React, { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { AgentRole } from '../types'
import { MermaidDiagram } from './MermaidDiagram'
import 'highlight.js/styles/github-dark.min.css'
import styles from './MessageBody.module.css'

// Совпадает с путями файлов в тексте:
// — Windows абсолютный: C:\path\to\file.ts
// — Unix абсолютный:    /path/to/file.ts
// — Относительный (2+ сегмента): src/components/Foo.tsx, ./lib/util.ts
const FILE_PATH_RE =
  /([A-Za-z]:[/\\][a-zA-Z0-9_+.\\/-]+|\.\.?\/[a-zA-Z0-9_+./-]+|\/[a-zA-Z_][a-zA-Z0-9_+./-]*\/[a-zA-Z0-9_+.-]+|[a-zA-Z][a-zA-Z0-9_-]*(?:\/[a-zA-Z0-9_.+-]+){2,})/g

function hasFileExtension(path: string): boolean {
  const name = path.split(/[/\\]/).pop() ?? ''
  return /\.[a-zA-Z0-9]{1,10}$/.test(name)
}

function showPath(path: string) {
  window.codeviper.showItemInFolder(path)
}

/** Текст из <pre><code> для копирования (unit-тест). */
export function extractCodeBlockText(children: ReactNode): string {
  if (children == null || typeof children === 'boolean') return ''
  if (typeof children === 'string') return children
  if (typeof children === 'number') return String(children)
  if (Array.isArray(children)) return children.map(extractCodeBlockText).join('')
  if (React.isValidElement<{ children?: ReactNode }>(children)) {
    return extractCodeBlockText(children.props.children)
  }
  return ''
}

function CodeBlockCopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    const value = text.replace(/\n$/, '')
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }, [text])

  return (
    <button
      type="button"
      className={styles.codeCopyBtn}
      onClick={() => void copy()}
      title="Копировать код"
      aria-label="Копировать код"
      disabled={!text.trim()}
    >
      {copied ? '✓' : 'Копировать'}
    </button>
  )
}

interface CtxMenu {
  path: string
  x: number
  y: number
}

interface Props {
  role: AgentRole
  content: string
  onFileTimeline?: (path: string) => void
  onExternalLink?: (url: string) => void
}

export const MessageBody = React.memo(function MessageBody({
  role,
  content,
  onFileTimeline,
  onExternalLink
}: Props) {
  const [ctxMenu, setCtxMenu] = useState<CtxMenu | null>(null)

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [ctxMenu])

  const handleFileCtxMenu = useCallback(
    (path: string, e: React.MouseEvent) => {
      if (!onFileTimeline) return
      e.preventDefault()
      setCtxMenu({ path, x: e.clientX, y: e.clientY })
    },
    [onFileTimeline]
  )

  const linkifyText = useCallback(
    (text: string): ReactNode[] => {
      const parts: ReactNode[] = []
      let lastIndex = 0

      for (const match of text.matchAll(FILE_PATH_RE)) {
        const path = match[1]
        if (!hasFileExtension(path)) continue

        const start = match.index!
        if (start > lastIndex) parts.push(text.slice(lastIndex, start))

        parts.push(
          <span
            key={start}
            className={styles.filePath}
            title={`Открыть в папке: ${path}`}
            onClick={() => showPath(path)}
            onContextMenu={(e) => handleFileCtxMenu(path, e)}
          >
            {path}
          </span>
        )
        lastIndex = start + match[0].length
      }

      if (lastIndex < text.length) parts.push(text.slice(lastIndex))
      return parts.length === 0 ? [text] : parts
    },
    [handleFileCtxMenu]
  )

  const processChildren = useCallback(
    (children: ReactNode): ReactNode => {
      return React.Children.map(children, (child) => {
        if (typeof child !== 'string') return child
        return linkifyText(child)
      })
    },
    [linkifyText]
  )

  const mdComponents = useMemo(
    () => ({
      p: ({ children }: { children?: ReactNode }) => <p>{processChildren(children)}</p>,
      li: ({ children }: { children?: ReactNode }) => <li>{processChildren(children)}</li>,
      td: ({ children }: { children?: ReactNode }) => <td>{processChildren(children)}</td>,
      a: ({ href, children }: { href?: string; children?: ReactNode }) => {
        const isExternal = typeof href === 'string' && /^https?:\/\//i.test(href)
        return (
          <a
            href={href}
            target={isExternal ? '_blank' : undefined}
            rel={isExternal ? 'noreferrer' : undefined}
            onClick={(e) => {
              if (!isExternal || !href) return
              e.preventDefault()
              onExternalLink?.(href)
            }}
          >
            {children}
          </a>
        )
      },

      code: ({ children, className }: { children?: ReactNode; className?: string }) => {
        const text = typeof children === 'string' ? children : String(children ?? '')
        if (!className && hasFileExtension(text) && (text.includes('/') || text.includes('\\'))) {
          return (
            <code
              className={styles.filePathCode}
              title={`Открыть в папке: ${text}`}
              onClick={() => showPath(text)}
              onContextMenu={(e) => handleFileCtxMenu(text, e)}
            >
              {children}
            </code>
          )
        }
        return <code className={className}>{children}</code>
      },

      pre: ({ children }: { children?: ReactNode }) => {
        const codeText = extractCodeBlockText(children)
        const child = React.Children.toArray(children)[0]
        const className = React.isValidElement<{ className?: string }>(child)
          ? child.props.className
          : undefined
        if (className?.includes('language-mermaid') && codeText.trim()) {
          return (
            <div className={styles.mermaidBlock}>
              <MermaidDiagram chart={codeText.trim()} />
            </div>
          )
        }
        return (
          <div className={styles.codeBlock}>
            <CodeBlockCopyButton text={codeText} />
            <pre>{children}</pre>
          </div>
        )
      }
    }),
    [processChildren, handleFileCtxMenu]
  )

  if (role === 'tool') {
    return <pre className="message-plain">{content}</pre>
  }

  return (
    <>
      <div className="message-body">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeHighlight]}
          components={mdComponents}
        >
          {content}
        </ReactMarkdown>
      </div>

      {ctxMenu && (
        <div
          className={styles.ctxMenu}
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className={styles.ctxMenuItem}
            onClick={() => {
              onFileTimeline?.(ctxMenu.path)
              setCtxMenu(null)
            }}
          >
            📋 История изменений
          </button>
        </div>
      )}
    </>
  )
})
