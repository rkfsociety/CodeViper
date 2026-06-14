import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { AgentRole } from '../types'

interface Props {
  role: AgentRole
  content: string
}

export function MessageBody({ role, content }: Props) {
  if (role === 'tool') {
    return <pre className="message-plain">{content}</pre>
  }

  return (
    <div className="message-body">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
}
