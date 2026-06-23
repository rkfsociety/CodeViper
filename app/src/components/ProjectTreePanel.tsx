import { useCallback, useEffect, useMemo, useState, type MouseEvent } from 'react'
import type { FileNode } from '../types'
import styles from './ProjectTreePanel.module.css'

const LIST_DIRECTORY_DEPTH = 3

interface Props {
  projectPath: string
  maxDepth?: number
  onAskAgent: (relativePath: string) => void
}

interface CtxMenuState {
  relativePath: string
  x: number
  y: number
}

function toRelativePath(projectRoot: string, absolutePath: string): string {
  const normRoot = projectRoot.replace(/\\/g, '/').replace(/\/$/, '')
  const normPath = absolutePath.replace(/\\/g, '/')
  const prefix = `${normRoot}/`
  if (normPath.toLowerCase().startsWith(prefix.toLowerCase())) {
    return normPath.slice(prefix.length)
  }
  return normPath
}

function projectBasename(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

interface TreeRowProps {
  node: FileNode
  projectPath: string
  depth: number
  expanded: Set<string>
  selectedPath: string | null
  onToggle: (path: string) => void
  onOpenFile: (node: FileNode) => void
  onContextMenu: (relativePath: string, e: MouseEvent) => void
}

function TreeRow({
  node,
  projectPath,
  depth,
  expanded,
  selectedPath,
  onToggle,
  onOpenFile,
  onContextMenu
}: TreeRowProps) {
  const relativePath = toRelativePath(projectPath, node.path)
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedPath === node.path

  const handleClick = () => {
    if (node.isDirectory) {
      onToggle(node.path)
      return
    }
    onOpenFile(node)
  }

  return (
    <>
      <button
        type="button"
        className={`${styles.treeRow}${isSelected ? ` ${styles.treeRowSelected}` : ''}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={relativePath}
        onClick={handleClick}
        onContextMenu={(e) => onContextMenu(relativePath, e)}
      >
        <span className={styles.treeIcon}>{node.isDirectory ? (isExpanded ? '▼' : '▶') : '·'}</span>
        <span className={styles.treeName}>{node.name}</span>
      </button>
      {node.isDirectory &&
        isExpanded &&
        node.children?.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            projectPath={projectPath}
            depth={depth + 1}
            expanded={expanded}
            selectedPath={selectedPath}
            onToggle={onToggle}
            onOpenFile={onOpenFile}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  )
}

export function ProjectTreePanel({
  projectPath,
  maxDepth = LIST_DIRECTORY_DEPTH,
  onAskAgent
}: Props) {
  const [tree, setTree] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [selectedFile, setSelectedFile] = useState<{ path: string; relativePath: string } | null>(
    null
  )
  const [preview, setPreview] = useState<string | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [ctxMenu, setCtxMenu] = useState<CtxMenuState | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadTree = useCallback(async () => {
    if (!projectPath.trim()) {
      setTree([])
      return
    }
    setLoading(true)
    try {
      const nodes = await window.codeviper.getProjectTree(projectPath, maxDepth)
      setTree(nodes)
      setExpanded((prev) => {
        const next = new Set<string>()
        for (const path of prev) {
          if (path.toLowerCase().startsWith(projectPath.toLowerCase())) next.add(path)
        }
        if (!next.size && nodes[0]?.isDirectory) next.add(nodes[0].path)
        return next
      })
    } finally {
      setLoading(false)
    }
  }, [projectPath, maxDepth])

  useEffect(() => {
    void loadTree()
  }, [loadTree, refreshKey])

  useEffect(() => {
    setSelectedFile(null)
    setPreview(null)
    setPreviewError(null)
  }, [projectPath])

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('mousedown', close)
    window.addEventListener('scroll', close, true)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [ctxMenu])

  const handleToggle = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const handleOpenFile = useCallback(
    async (node: FileNode) => {
      const relativePath = toRelativePath(projectPath, node.path)
      setSelectedFile({ path: node.path, relativePath })
      setPreviewLoading(true)
      setPreview(null)
      setPreviewError(null)
      try {
        const content = await window.codeviper.readFile(projectPath, relativePath)
        setPreview(content)
      } catch (e) {
        setPreviewError(e instanceof Error ? e.message : String(e))
      } finally {
        setPreviewLoading(false)
      }
    },
    [projectPath]
  )

  const handleContextMenu = useCallback((relativePath: string, e: MouseEvent) => {
    e.preventDefault()
    setCtxMenu({ relativePath, x: e.clientX, y: e.clientY })
  }, [])

  const projectLabel = useMemo(() => projectBasename(projectPath), [projectPath])

  if (!projectPath.trim()) {
    return <div className={styles.empty}>Выберите проект в чате</div>
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <span className={styles.projectLabel} title={projectPath}>
          {projectLabel}
        </span>
        <button
          type="button"
          className={`btn ${styles.refreshBtn}`}
          onClick={() => setRefreshKey((k) => k + 1)}
          title="Обновить дерево"
        >
          ↻
        </button>
      </div>

      <div className={styles.treeWrap}>
        {loading ? (
          <div className={styles.loading}>Загрузка…</div>
        ) : tree.length === 0 ? (
          <div className={styles.empty}>Проект пуст</div>
        ) : (
          tree.map((node) => (
            <TreeRow
              key={node.path}
              node={node}
              projectPath={projectPath}
              depth={0}
              expanded={expanded}
              selectedPath={selectedFile?.path ?? null}
              onToggle={handleToggle}
              onOpenFile={handleOpenFile}
              onContextMenu={handleContextMenu}
            />
          ))
        )}
      </div>

      {selectedFile && (
        <div className={styles.preview}>
          <div className={styles.previewHeader}>
            <span className={styles.previewPath} title={selectedFile.relativePath}>
              {selectedFile.relativePath}
            </span>
            <button
              type="button"
              className={`btn ${styles.previewClose}`}
              onClick={() => {
                setSelectedFile(null)
                setPreview(null)
                setPreviewError(null)
              }}
            >
              ✕
            </button>
          </div>
          {previewLoading && <div className={styles.loading}>Чтение файла…</div>}
          {previewError && <div className={styles.previewError}>{previewError}</div>}
          {!previewLoading && !previewError && preview != null && (
            <pre className={styles.previewBody}>{preview}</pre>
          )}
        </div>
      )}

      {ctxMenu && (
        <div
          className={styles.ctxMenu}
          style={{ top: ctxMenu.y, left: ctxMenu.x }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={styles.ctxMenuItem}
            onClick={() => {
              onAskAgent(ctxMenu.relativePath)
              setCtxMenu(null)
            }}
          >
            Спросить агента (@{ctxMenu.relativePath})
          </button>
        </div>
      )}
    </div>
  )
}
