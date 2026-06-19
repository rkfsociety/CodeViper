import React from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { AgentRole } from '../types'
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

function linkifyText(text: string): ReactNode[] {
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
      >
        {path}
      </span>
    )
    lastIndex = start + match[0].length
  }

  if (lastIndex < text.length) parts.push(text.slice(lastIndex))
  // Если ничего не заменили — возвращаем исходную строку (без лишних оборачиваний)
  return parts.length === 0 ? [text] : parts
}

function processChildren(children: ReactNode): ReactNode {
  return React.Children.map(children, (child) => {
    if (typeof child !== 'string') return child
    return linkifyText(child)
  })
}

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

const mdComponents = {
  p: ({ children }: { children?: ReactNode }) => <p>{processChildren(children)}</p>,
  li: ({ children }: { children?: ReactNode }) => <li>{processChildren(children)}</li>,
  td: ({ children }: { children?: ReactNode }) => <td>{processChildren(children)}</td>,

  // Inline-код: если содержимое похоже на путь файла — делаем кликабельным
  code: ({ children, className }: { children?: ReactNode; className?: string }) => {
    const text = typeof children === 'string' ? children : String(children ?? '')
    if (!className && hasFileExtension(text) && (text.includes('/') || text.includes('\\'))) {
      return (
        <code
          className={styles.filePathCode}
          title={`Открыть в папке: ${text}`}
          onClick={() => showPath(text)}
        >
          {children}
        </code>
      )
    }
    return <code className={className}>{children}</code>
  }
}

interface Props {
  role: AgentRole
  content: string
}

export const MessageBody = React.memo(function MessageBody({ role, content }: Props) {
  if (role === 'tool') {
    return <pre className="message-plain">{content}</pre>
  }

  return (
    <div className="message-body">
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={mdComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
})
