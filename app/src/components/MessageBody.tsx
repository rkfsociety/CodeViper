import ReactMarkdown from 'react-markdown'
import rehypeHighlight from 'rehype-highlight'
import remarkGfm from 'remark-gfm'
import type { AgentRole } from '../types'
import 'highlight.js/styles/github-dark.min.css'

const remarkPlugins = [remarkGfm]
const rehypePlugins = [rehypeHighlight]

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
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
