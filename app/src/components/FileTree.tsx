import { useEffect, useState } from 'react'
import type { FileNode } from '../types'

interface Props {
  root: string
  onSelect: (path: string) => void
  selected?: string
}

function Node({ node, depth, onSelect, selected }: {
  node: FileNode
  depth: number
  onSelect: (path: string) => void
  selected?: string
}) {
  return (
    <>
      <button
        className={`file-node ${node.isDirectory ? 'dir' : ''} ${selected === node.path ? 'active' : ''}`}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        onClick={() => onSelect(node.path)}
      >
        {node.isDirectory ? '📁 ' : '📄 '}
        {node.name}
      </button>
      {node.children?.map((child) => (
        <Node
          key={child.path}
          node={child}
          depth={depth + 1}
          onSelect={onSelect}
          selected={selected}
        />
      ))}
    </>
  )
}

export function FileTree({ root, onSelect, selected }: Props) {
  const [tree, setTree] = useState<FileNode[]>([])

  useEffect(() => {
    window.codeviper.listDirectory(root).then(setTree).catch(() => setTree([]))
  }, [root])

  if (!tree.length) {
    return <div className="file-tree empty">Папка пуста или недоступна</div>
  }

  return (
    <div className="file-tree">
      {tree.map((node) => (
        <Node key={node.path} node={node} depth={0} onSelect={onSelect} selected={selected} />
      ))}
    </div>
  )
}
