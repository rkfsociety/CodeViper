import { useEffect, useState } from 'react'
import type { FileNode } from '../types'

interface Props {
  root: string
  onSelect: (relativePath: string) => void
}

function toRelativePath(root: string, absolutePath: string): string {
  const normRoot = root.replace(/\\/g, '/').replace(/\/$/, '')
  const normPath = absolutePath.replace(/\\/g, '/')
  const prefix = `${normRoot}/`
  if (normPath.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normPath.slice(prefix.length)
  }
  return absolutePath
}

function Node({
  node,
  depth,
  root,
  onSelect
}: {
  node: FileNode
  depth: number
  root: string
  onSelect: (relativePath: string) => void
}) {
  function handleClick() {
    onSelect(toRelativePath(root, node.path))
  }

  return (
    <>
      <button
        type="button"
        className={`file-node ${node.isDirectory ? 'dir' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        title={toRelativePath(root, node.path)}
        onClick={handleClick}
      >
        {node.isDirectory ? '📁 ' : '📄 '}
        {node.name}
      </button>
      {node.children?.map((child) => (
        <Node key={child.path} node={child} depth={depth + 1} root={root} onSelect={onSelect} />
      ))}
    </>
  )
}

export function FileTree({ root, onSelect }: Props) {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    window.codeviper
      .listDirectory(root)
      .then((nodes) => {
        if (!cancelled) setTree(nodes)
      })
      .catch(() => {
        if (!cancelled) setTree([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [root])

  if (loading) {
    return <div className="file-tree empty">Загрузка…</div>
  }

  if (!tree.length) {
    return <div className="file-tree empty">Папка пуста или недоступна</div>
  }

  return (
    <div className="file-tree">
      {tree.map((node) => (
        <Node key={node.path} node={node} depth={0} root={root} onSelect={onSelect} />
      ))}
    </div>
  )
}
